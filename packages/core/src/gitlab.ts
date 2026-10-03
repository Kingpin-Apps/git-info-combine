import { HttpError, request, type HttpOptions } from "./http.ts";
import {
  addDays,
  addRepoLanguages,
  emptyTotals,
  toDateKey,
  type DateKey,
  type HostActivity,
  type LanguageStat,
} from "./model.ts";
import { isExcluded, opaqueId, SensitiveNames } from "./privacy.ts";

export interface GitLabDay {
  contributions: number;
  /** Commits from push events. Kept for reference; totals use contributor counts instead. */
  commits: number;
  pullRequests: number;
  issues: number;
  reviews: number;
}

/** What one project adds, reused until the project's last activity changes. */
export interface GitLabProjectStats {
  /** The project's `last_activity_at` when these were fetched. */
  activity: string;
  /** The user's commits on the default branch, from the contributor list. */
  commits: number;
  /** Hashed latest commit on the default branch, for spotting mirrors of GitHub repos. */
  head: string | null;
  wordpress: boolean;
  /** Language percentages, as GitLab reports them. */
  languages: Record<string, number>;
  size: number;
}

export interface GitLabCache {
  /** Hash of the instance URL, so a self-hosted hostname is never written out. */
  instance: string;
  userId: number;
  login: string;
  /**
   * Last day fetched. GitLab may delete old events, so days before this are
   * kept from the cache and only later events are fetched again.
   */
  fetchedThrough: DateKey;
  days: Record<DateKey, GitLabDay>;
  /** Opaque ids of projects the user has contributed to. */
  projects: string[];
  /** Per-project stats, by opaque project id. */
  projectStats?: Record<string, GitLabProjectStats>;
  /** Hash of the mirrored projects the events were counted without; a change means counting again. */
  mirrors?: string;
}

export interface GitLabOptions extends HttpOptions {
  token: string;
  /** Instance URL. Defaults to https://gitlab.com; set it for self-hosted GitLab. */
  baseUrl?: string;
  now?: Date;
  cache?: GitLabCache;
  /** Project names or `namespace/name` paths to leave out of languages and stars. */
  excludeRepos?: string[];
  /** Hashed latest commits of GitHub repos. A project whose latest commit matches is a mirror. */
  githubHeads?: Set<string>;
  /** Project paths to treat as mirrors of GitHub repos, in addition to the ones spotted automatically. */
  mirrors?: string[];
  /** Count a project that bundles WordPress core as one PHP project. Defaults to true. */
  detectWordPress?: boolean;
  /** Size used for a project whose repository size is unknown. */
  fallbackProjectSize?: number;
}

export interface GitLabResult {
  activity: HostActivity;
  cache: GitLabCache;
  sensitive: SensitiveNames;
  /** How many projects were counted once because they mirror a GitHub repo. */
  mirrored: number;
}

interface GitLabUser {
  id: number;
  username: string;
  name: string;
  email?: string;
  public_email?: string;
  commit_email?: string;
  followers?: number;
}

interface GitLabEvent {
  action_name: string;
  target_type: string | null;
  created_at: string;
  project_id: number | null;
  push_data?: { commit_count: number; ref_type: string } | null;
  note?: { noteable_type: string } | null;
}

interface GitLabProject {
  id: number;
  name: string;
  path: string;
  path_with_namespace: string;
  name_with_namespace: string;
  visibility: "public" | "internal" | "private";
  star_count: number;
  default_branch?: string | null;
  last_activity_at: string;
  empty_repo?: boolean;
  forked_from_project?: unknown;
  statistics?: { repository_size?: number };
  permissions?: {
    project_access?: { access_level: number } | null;
    group_access?: { access_level: number } | null;
  };
}

/** Events that are not contributions. Everything else counts, as on GitLab's own calendar. */
const IGNORED_ACTIONS = new Set(["joined", "left", "expired", "deleted", "destroyed"]);
const MAINTAINER = 40;

export async function fetchGitLab(options: GitLabOptions): Promise<GitLabResult> {
  const baseUrl = (options.baseUrl ?? "https://gitlab.com").replace(/\/+$/, "");
  const api = `${baseUrl}/api/v4`;
  const now = options.now ?? new Date();
  const headers = { authorization: `Bearer ${options.token}`, "user-agent": "git-info-combine" };
  const get = (path: string, method = "GET") => request(`${api}${path}`, { method, headers }, options);
  /** A request that may 404, for example on an empty repository. */
  const tryGet = async <T>(path: string, method = "GET"): Promise<{ response: Response; body: T } | null> => {
    try {
      const response = await get(path, method);
      return { response, body: (method === "HEAD" ? null : await response.json()) as T };
    } catch (error) {
      if (error instanceof HttpError && (error.status === 404 || error.status === 403)) return null;
      throw error;
    }
  };

  const sensitive = new SensitiveNames();
  const hostname = new URL(baseUrl).hostname;
  if (hostname !== "gitlab.com") sensitive.add(hostname);

  const user = (await (await get("/user")).json()) as GitLabUser;
  sensitive.allow(user.username);
  const emails = new Set(
    [user.email, user.public_email, user.commit_email, `${user.id}-${user.username}@users.noreply.gitlab.com`]
      .filter((email): email is string => Boolean(email))
      .map((email) => email.toLowerCase()),
  );
  for (const { email } of (await tryGet<{ email: string }[]>("/user/emails"))?.body ?? []) emails.add(email.toLowerCase());

  const instance = opaqueId("gitlab-instance", baseUrl.toLowerCase());
  const cached = options.cache?.instance === instance && options.cache.userId === user.id ? options.cache : undefined;
  const detectWordPress = options.detectWordPress !== false;
  const manualMirrors = new Set((options.mirrors ?? []).map((path) => path.trim().toLowerCase()));

  // Projects first: they decide which pushes are mirrors and must not count twice.
  const projectStats: Record<string, GitLabProjectStats> = {};
  const mirroredIds = new Set<number>();
  const languages: Record<string, LanguageStat> = {};
  const repos = { public: 0, private: 0 };
  let stars = 0;
  let commits = 0;

  for await (const project of paginate<GitLabProject>(get, "/projects", {
    membership: "true",
    min_access_level: "30",
    statistics: "true",
  })) {
    if (project.visibility !== "public") {
      sensitive.add(project.name, project.path, project.path_with_namespace, project.name_with_namespace);
    }
    // Forks are skipped, as on GitHub: their stars, code and commits belong upstream.
    if (project.forked_from_project) continue;

    const id = opaqueId("gitlab", project.id);
    const previous = cached?.projectStats?.[id];
    const stats =
      previous && previous.activity === project.last_activity_at
        ? previous
        : await projectStatsFor(project, { tryGet, emails, name: user.name, detectWordPress, fallback: options.fallbackProjectSize });
    projectStats[id] = stats;

    const mirrored =
      manualMirrors.has(project.path_with_namespace.toLowerCase()) ||
      (stats.head !== null && (options.githubHeads?.has(stats.head) ?? false));
    if (mirrored) {
      mirroredIds.add(project.id);
      continue;
    }

    commits += stats.commits;
    const access = Math.max(project.permissions?.project_access?.access_level ?? 0, project.permissions?.group_access?.access_level ?? 0);
    if (access < MAINTAINER && project.permissions) continue;
    if (isExcluded(options.excludeRepos, project.name, project.path, project.path_with_namespace)) continue;

    if (project.visibility === "public") repos.public++;
    else repos.private++;
    stars += project.star_count;
    addRepoLanguages(
      languages,
      Object.fromEntries(Object.entries(stats.languages).map(([name, percent]) => [name, { size: Math.round((stats.size * percent) / 100), color: null }])),
      stats.wordpress,
    );
  }

  // Events. A change in which projects are mirrors means counting every event again.
  const mirrorKey = opaqueId("mirrors", [...mirroredIds].sort((a, b) => a - b).join(","));
  const resume = cached && cached.mirrors === mirrorKey ? cached : undefined;
  const today = toDateKey(now);
  const days: Record<DateKey, GitLabDay> = {};
  const projects = new Set(resume?.projects);
  let after: DateKey | undefined;
  if (resume) {
    // Refetch from the last fetched day, which may have been partial.
    for (const [day, counts] of Object.entries(resume.days)) {
      if (day < resume.fetchedThrough) days[day] = counts;
    }
    after = addDays(resume.fetchedThrough, -1);
  }

  for await (const event of paginate<GitLabEvent>(get, "/events", { sort: "asc", after })) {
    if (IGNORED_ACTIONS.has(event.action_name)) continue;
    // Pushes to a mirror already count on GitHub.
    if (event.push_data && event.project_id !== null && mirroredIds.has(event.project_id)) continue;
    const day = (days[toDateKey(event.created_at)] ??= emptyDay());
    day.contributions++;
    if (event.project_id !== null) projects.add(opaqueId("gitlab", event.project_id));

    if (event.push_data) {
      if (event.push_data.ref_type !== "tag") day.commits += event.push_data.commit_count;
    } else if (event.action_name === "opened" || event.action_name === "created") {
      if (event.target_type === "MergeRequest") day.pullRequests++;
      if (event.target_type === "Issue") day.issues++;
    } else if (event.action_name === "approved" || event.note?.noteable_type === "MergeRequest") {
      day.reviews++;
    }
  }

  const totals = emptyTotals();
  const calendar: Record<DateKey, number> = {};
  for (const [date, day] of Object.entries(days)) {
    calendar[date] = day.contributions;
    totals.contributions += day.contributions;
    totals.pullRequests += day.pullRequests;
    totals.issues += day.issues;
    totals.reviews += day.reviews;
  }
  totals.commits = commits;
  totals.stars = stars;
  totals.followers = user.followers ?? 0;
  totals.contributedTo = projects.size;

  return {
    activity: { host: "gitlab", login: user.username, days: calendar, totals, languages, repos },
    cache: {
      instance,
      userId: user.id,
      login: user.username,
      fetchedThrough: today,
      days,
      projects: [...projects].sort(),
      projectStats,
      mirrors: mirrorKey,
    },
    sensitive,
    mirrored: mirroredIds.size,
  };
}

interface StatsContext {
  tryGet: <T>(path: string, method?: string) => Promise<{ response: Response; body: T } | null>;
  emails: Set<string>;
  name: string;
  detectWordPress: boolean;
  fallback?: number;
}

/** Fetches what a project adds: the user's commits, its head commit, languages and whether it is WordPress. */
async function projectStatsFor(project: GitLabProject, context: StatsContext): Promise<GitLabProjectStats> {
  const base = `/projects/${project.id}`;
  const stats: GitLabProjectStats = {
    activity: project.last_activity_at,
    commits: 0,
    head: null,
    wordpress: false,
    languages: {},
    size: project.statistics?.repository_size || (context.fallback ?? 1_000_000),
  };
  if (project.empty_repo || !project.default_branch) return stats;

  // Contributors are counted on the default branch, as GitHub counts commits.
  for (let page = 1; ; page++) {
    const result = await context.tryGet<{ name: string; email: string; commits: number }[]>(
      `${base}/repository/contributors?per_page=100&page=${page}`,
    );
    for (const contributor of result?.body ?? []) {
      if (context.emails.has(contributor.email.toLowerCase()) || contributor.name === context.name) {
        stats.commits += contributor.commits;
      }
    }
    if (!result?.response.headers.get("x-next-page")) break;
  }

  const head = await context.tryGet<{ id: string }[]>(
    `${base}/repository/commits?per_page=1&ref_name=${encodeURIComponent(project.default_branch)}`,
  );
  if (head?.body[0]) stats.head = opaqueId("commit", head.body[0].id);

  stats.languages = (await context.tryGet<Record<string, number>>(`${base}/languages`))?.body ?? {};
  if (context.detectWordPress && "PHP" in stats.languages) {
    const file = encodeURIComponent("wp-includes/version.php");
    stats.wordpress =
      (await context.tryGet(`${base}/repository/files/${file}?ref=${encodeURIComponent(project.default_branch)}`, "HEAD")) !== null;
  }
  return stats;
}

function emptyDay(): GitLabDay {
  return { contributions: 0, commits: 0, pullRequests: 0, issues: 0, reviews: 0 };
}

async function* paginate<T>(
  get: (path: string) => Promise<Response>,
  path: string,
  params: Record<string, string | undefined>,
): AsyncGenerator<T> {
  let page: string | null = "1";
  while (page) {
    const query = new URLSearchParams({ per_page: "100", page });
    for (const [key, value] of Object.entries(params)) if (value !== undefined) query.set(key, value);
    const response = await get(`${path}?${query}`);
    const items = (await response.json()) as T[];
    yield* items;
    page = items.length > 0 ? response.headers.get("x-next-page") || null : null;
  }
}
