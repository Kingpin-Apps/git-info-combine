import { request, type HttpOptions } from "./http.ts";
import { addDays, emptyTotals, toDateKey, type DateKey, type HostActivity, type LanguageStat } from "./model.ts";
import { opaqueId, SensitiveNames } from "./privacy.ts";

export interface GitLabDay {
  contributions: number;
  commits: number;
  pullRequests: number;
  issues: number;
  reviews: number;
}

export interface GitLabCache {
  /** Hash of the instance URL, so a self-hosted hostname is never written out. */
  instance: string;
  userId: number;
  login: string;
  /**
   * Last day fetched. GitLab deletes events older than 3 years, so days before
   * this are kept from the cache and only later events are fetched again.
   */
  fetchedThrough: DateKey;
  days: Record<DateKey, GitLabDay>;
  /** Opaque ids of projects the user has contributed to. */
  projects: string[];
}

export interface GitLabOptions extends HttpOptions {
  token: string;
  /** Instance URL. Defaults to https://gitlab.com; set it for self-hosted GitLab. */
  baseUrl?: string;
  now?: Date;
  cache?: GitLabCache;
  /** Size used for a project whose repository size is unknown. */
  fallbackProjectSize?: number;
}

export interface GitLabResult {
  activity: HostActivity;
  cache: GitLabCache;
  sensitive: SensitiveNames;
}

interface GitLabUser {
  id: number;
  username: string;
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
  forked_from_project?: unknown;
  statistics?: { repository_size?: number };
}

/** Events that are not contributions. Everything else counts, as on GitLab's own calendar. */
const IGNORED_ACTIONS = new Set(["joined", "left", "expired", "deleted", "destroyed"]);

export async function fetchGitLab(options: GitLabOptions): Promise<GitLabResult> {
  const baseUrl = (options.baseUrl ?? "https://gitlab.com").replace(/\/+$/, "");
  const api = `${baseUrl}/api/v4`;
  const now = options.now ?? new Date();
  const get = (path: string) =>
    request(`${api}${path}`, { headers: { authorization: `Bearer ${options.token}`, "user-agent": "git-info-combine" } }, options);

  const sensitive = new SensitiveNames();
  const hostname = new URL(baseUrl).hostname;
  if (hostname !== "gitlab.com") sensitive.add(hostname);

  const user = (await (await get("/user")).json()) as GitLabUser;
  sensitive.allow(user.username);

  const instance = opaqueId("gitlab-instance", baseUrl.toLowerCase());
  const cached =
    options.cache?.instance === instance && options.cache.userId === user.id ? options.cache : undefined;

  const today = toDateKey(now);
  const days: Record<DateKey, GitLabDay> = {};
  const projects = new Set(cached?.projects);
  let after: DateKey | undefined;
  if (cached) {
    // Refetch from the last fetched day, which may have been partial.
    for (const [day, counts] of Object.entries(cached.days)) {
      if (day < cached.fetchedThrough) days[day] = counts;
    }
    after = addDays(cached.fetchedThrough, -1);
  }

  for await (const event of paginate<GitLabEvent>(get, "/events", { sort: "asc", after })) {
    if (IGNORED_ACTIONS.has(event.action_name)) continue;
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

  const languages: Record<string, LanguageStat> = {};
  const repos = { public: 0, private: 0 };
  let stars = 0;
  for await (const project of paginate<GitLabProject>(get, "/projects", {
    membership: "true",
    min_access_level: "40",
    statistics: "true",
  })) {
    // Forks are skipped, as on GitHub: their stars and code belong to the upstream project.
    if (project.forked_from_project) continue;
    if (project.visibility === "public") {
      repos.public++;
    } else {
      sensitive.add(project.name, project.path, project.path_with_namespace, project.name_with_namespace);
      repos.private++;
    }
    stars += project.star_count;

    const size = project.statistics?.repository_size || (options.fallbackProjectSize ?? 1_000_000);
    const percentages = (await (await get(`/projects/${project.id}/languages`)).json()) as Record<string, number>;
    for (const [name, percent] of Object.entries(percentages)) {
      const stat = (languages[name] ??= { size: 0, repos: 0, color: null });
      stat.size += Math.round((size * percent) / 100);
      stat.repos++;
    }
  }

  const totals = emptyTotals();
  const calendar: Record<DateKey, number> = {};
  for (const [date, day] of Object.entries(days)) {
    calendar[date] = day.contributions;
    totals.contributions += day.contributions;
    totals.commits += day.commits;
    totals.pullRequests += day.pullRequests;
    totals.issues += day.issues;
    totals.reviews += day.reviews;
  }
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
    },
    sensitive,
  };
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
