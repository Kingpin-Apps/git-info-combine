import { json, type Call, type Route } from "./mock.ts";

/** Private names used across the fixtures. None may appear in any output. */
export const PRIVATE_NAMES = [
  "topsecret-banking-core",
  "octo/topsecret-banking-core",
  "client-portal-x",
  "acme-corp/client-portal-x",
  "Acme Corp / Client Portal X",
  "hidden-wp-site",
  "acme-corp/hidden-wp-site",
  "git.secretcorp.internal",
];

export const NOW = new Date("2026-10-02T12:00:00Z");

function week(...days: [string, number][]) {
  return { contributionDays: days.map(([date, contributionCount]) => ({ date, contributionCount })) };
}

const YEARS: Record<string, unknown> = {
  "2025": {
    totalCommitContributions: 10,
    totalIssueContributions: 2,
    totalPullRequestContributions: 3,
    totalPullRequestReviewContributions: 1,
    contributionCalendar: {
      totalContributions: 16,
      weeks: [week(["2025-06-01", 0], ["2025-06-02", 7]), week(["2025-12-31", 9])],
    },
  },
  "2026": {
    totalCommitContributions: 4,
    totalIssueContributions: 0,
    totalPullRequestContributions: 1,
    totalPullRequestReviewContributions: 2,
    contributionCalendar: { totalContributions: 7, weeks: [week(["2026-01-05", 3], ["2026-10-01", 4])] },
  },
};

export const githubRoute: Route = (call: Call) => {
  if (call.url.href !== "https://api.github.com/graphql") return undefined;
  const { query, variables } = call.body as { query: string; variables: Record<string, string | null> };

  if (query.includes("createdAt")) {
    return json({
      data: {
        viewer: {
          login: "octo",
          createdAt: "2025-03-15T08:00:00Z",
          followers: { totalCount: 12 },
          repositoriesContributedTo: { totalCount: 5 },
        },
      },
    });
  }

  if (query.includes("contributionsCollection")) {
    const year = String(variables.from).slice(0, 4);
    return json({ data: { viewer: { contributionsCollection: YEARS[year] } } });
  }

  if (query.includes("repositories")) {
    const first = variables.after == null;
    return json({
      data: {
        viewer: {
          repositories: {
            pageInfo: { hasNextPage: first, endCursor: first ? "cursor-1" : null },
            nodes: first
              ? [
                  {
                    name: "topsecret-banking-core",
                    nameWithOwner: "octo/topsecret-banking-core",
                    isPrivate: true,
                    stargazerCount: 0,
                    defaultBranchRef: { target: { oid: "eee555" } },
                    wordpress: null,
                    languages: { edges: [{ size: 5000, node: { name: "Swift", color: "#F05138" } }] },
                  },
                ]
              : [
                  {
                    name: "dotfiles",
                    nameWithOwner: "octo/dotfiles",
                    isPrivate: false,
                    stargazerCount: 3,
                    defaultBranchRef: { target: { oid: "ccc333" } },
                    wordpress: null,
                    languages: {
                      edges: [
                        { size: 1000, node: { name: "Shell", color: "#89e051" } },
                        { size: 500, node: { name: "Swift", color: "#F05138" } },
                      ],
                    },
                  },
                ],
          },
        },
      },
    });
  }
  return undefined;
};

export const GITLAB_EVENTS = [
  { action_name: "pushed to", target_type: null, created_at: "2026-09-30T10:00:00Z", project_id: 1, push_data: { commit_count: 3, ref_type: "branch" } },
  { action_name: "pushed new", target_type: null, created_at: "2026-09-30T11:00:00Z", project_id: 1, push_data: { commit_count: 0, ref_type: "tag" } },
  { action_name: "opened", target_type: "MergeRequest", created_at: "2026-09-30T12:00:00Z", project_id: 2 },
  { action_name: "joined", target_type: null, created_at: "2026-10-01T09:00:00Z", project_id: 3 },
  { action_name: "opened", target_type: "Issue", created_at: "2026-10-01T10:00:00Z", project_id: 2 },
  { action_name: "approved", target_type: "MergeRequest", created_at: "2026-10-02T08:00:00Z", project_id: 2 },
  { action_name: "commented on", target_type: "DiffNote", created_at: "2026-10-02T09:00:00Z", project_id: 2, note: { noteable_type: "MergeRequest" } },
  { action_name: "commented on", target_type: "Note", created_at: "2026-10-02T09:30:00Z", project_id: 2, note: { noteable_type: "Issue" } },
];

const maintainer = { project_access: { access_level: 40 }, group_access: null };
const ACTIVE = "2026-10-01T00:00:00Z";

export const GITLAB_PROJECTS = [
  {
    id: 1,
    name: "client-portal-x",
    path: "client-portal-x",
    path_with_namespace: "acme-corp/client-portal-x",
    name_with_namespace: "Acme Corp / Client Portal X",
    visibility: "private",
    star_count: 1,
    default_branch: "main",
    last_activity_at: ACTIVE,
    permissions: maintainer,
    statistics: { repository_size: 10_000 },
  },
  {
    id: 2,
    name: "open-widget",
    path: "open-widget",
    path_with_namespace: "octo/open-widget",
    name_with_namespace: "octo / open-widget",
    visibility: "public",
    star_count: 4,
    default_branch: "main",
    last_activity_at: ACTIVE,
    permissions: maintainer,
    statistics: { repository_size: 2_000 },
  },
  {
    id: 3,
    name: "forked-thing",
    path: "forked-thing",
    path_with_namespace: "octo/forked-thing",
    name_with_namespace: "octo / forked-thing",
    visibility: "public",
    star_count: 100,
    default_branch: "main",
    last_activity_at: ACTIVE,
    permissions: maintainer,
    forked_from_project: { id: 99 },
  },
  {
    id: 4,
    name: "hidden-wp-site",
    path: "hidden-wp-site",
    path_with_namespace: "acme-corp/hidden-wp-site",
    name_with_namespace: "Acme Corp / hidden-wp-site",
    visibility: "private",
    star_count: 2,
    default_branch: "main",
    last_activity_at: ACTIVE,
    permissions: maintainer,
    statistics: { repository_size: 500_000_000 },
  },
];

const GITLAB_CONTRIBUTORS: Record<string, { name: string; email: string; commits: number }[]> = {
  "1": [
    { name: "Octo Cat", email: "octo@example.com", commits: 12 },
    { name: "Someone Else", email: "else@example.com", commits: 50 },
  ],
  "2": [{ name: "Octo C.", email: "OCTO@work.example", commits: 5 }],
  "4": [{ name: "Octo Cat", email: "old@laptop.local", commits: 7 }],
};

const GITLAB_HEADS: Record<string, string> = { "1": "aaa111", "2": "bbb222", "4": "ddd444" };

const GITLAB_LANGUAGES: Record<string, Record<string, number>> = {
  "1": { TypeScript: 75, CSS: 25 },
  "2": { Python: 100 },
  "4": { PHP: 70, JavaScript: 20, CSS: 10 },
};

/** A GitLab instance at `baseUrl` that serves events in pages of `pageSize`. */
export function gitlabRoute(baseUrl = "https://gitlab.com", events = GITLAB_EVENTS, pageSize = 3): Route {
  return (call) => {
    const api = `${baseUrl}/api/v4`;
    if (!call.url.href.startsWith(api)) return undefined;
    const path = call.url.pathname.slice(new URL(api).pathname.length);

    if (path === "/user") return json({ id: 42, username: "octo", name: "Octo Cat", email: "octo@example.com", followers: 2 });
    if (path === "/user/emails") return json([{ email: "octo@work.example" }]);

    if (path === "/events") {
      const after = call.url.searchParams.get("after");
      const page = Number(call.url.searchParams.get("page"));
      const matching = events.filter((event) => !after || event.created_at.slice(0, 10) > after);
      const items = matching.slice((page - 1) * pageSize, page * pageSize);
      const hasNext = page * pageSize < matching.length;
      return json(items, { "x-next-page": hasNext ? String(page + 1) : "" });
    }

    if (path === "/projects") return json(GITLAB_PROJECTS, { "x-next-page": "" });

    const languages = path.match(/^\/projects\/(\d+)\/languages$/);
    if (languages) return json(GITLAB_LANGUAGES[languages[1]!] ?? {});
    const contributors = path.match(/^\/projects\/(\d+)\/repository\/contributors$/);
    if (contributors) return json(GITLAB_CONTRIBUTORS[contributors[1]!] ?? [], { "x-next-page": "" });
    const commits = path.match(/^\/projects\/(\d+)\/repository\/commits$/);
    if (commits) return json([{ id: GITLAB_HEADS[commits[1]!] }]);
    const file = path.match(/^\/projects\/(\d+)\/repository\/files\/wp-includes%2Fversion\.php$/);
    if (file) return new Response(null, { status: file[1] === "4" ? 200 : 404 });
    return undefined;
  };
}
