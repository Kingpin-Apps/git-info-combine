import { request, type HttpOptions } from "./http.ts";
import { emptyTotals, type DateKey, type HostActivity, type LanguageStat } from "./model.ts";
import { isExcluded, SensitiveNames } from "./privacy.ts";

export interface GitHubYear {
  /** True once the year had ended when it was fetched, so it never changes again. */
  complete: boolean;
  days: Record<DateKey, number>;
  contributions: number;
  commits: number;
  pullRequests: number;
  issues: number;
  reviews: number;
}

export interface GitHubCache {
  login: string;
  years: Record<string, GitHubYear>;
}

export interface GitHubOptions extends HttpOptions {
  token: string;
  apiUrl?: string;
  now?: Date;
  cache?: GitHubCache;
  /**
   * Count repos in organisations the user belongs to towards languages and
   * stars, not only repos the user owns. Defaults to true.
   */
  includeOrgRepos?: boolean;
  /** Repo names or `owner/name` paths to leave out of languages and stars. */
  excludeRepos?: string[];
}

export interface GitHubResult {
  activity: HostActivity;
  cache: GitHubCache;
  sensitive: SensitiveNames;
}

const VIEWER_QUERY = `query {
  viewer {
    login
    createdAt
    followers { totalCount }
    repositoriesContributedTo(first: 1, includeUserRepositories: true, contributionTypes: [COMMIT, PULL_REQUEST, ISSUE, PULL_REQUEST_REVIEW]) { totalCount }
  }
}`;

const YEAR_QUERY = `query ($from: DateTime!, $to: DateTime!) {
  viewer {
    contributionsCollection(from: $from, to: $to) {
      totalCommitContributions
      totalIssueContributions
      totalPullRequestContributions
      totalPullRequestReviewContributions
      contributionCalendar {
        totalContributions
        weeks { contributionDays { date contributionCount } }
      }
    }
  }
}`;

const REPOS_QUERY = `query ($after: String, $affiliations: [RepositoryAffiliation]) {
  viewer {
    repositories(first: 100, after: $after, ownerAffiliations: $affiliations, isFork: false) {
      pageInfo { hasNextPage endCursor }
      nodes {
        name
        nameWithOwner
        isPrivate
        stargazerCount
        languages(first: 20, orderBy: { field: SIZE, direction: DESC }) {
          edges { size node { name color } }
        }
      }
    }
  }
}`;

interface ViewerData {
  viewer: {
    login: string;
    createdAt: string;
    followers: { totalCount: number };
    repositoriesContributedTo: { totalCount: number };
  };
}

interface YearData {
  viewer: {
    contributionsCollection: {
      totalCommitContributions: number;
      totalIssueContributions: number;
      totalPullRequestContributions: number;
      totalPullRequestReviewContributions: number;
      contributionCalendar: {
        totalContributions: number;
        weeks: { contributionDays: { date: string; contributionCount: number }[] }[];
      };
    };
  };
}

interface ReposData {
  viewer: {
    repositories: {
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
      nodes: {
        name: string;
        nameWithOwner: string;
        isPrivate: boolean;
        stargazerCount: number;
        languages: { edges: { size: number; node: { name: string; color: string | null } }[] };
      }[];
    };
  };
}

export async function fetchGitHub(options: GitHubOptions): Promise<GitHubResult> {
  const now = options.now ?? new Date();
  const graphql = <T>(query: string, variables: Record<string, unknown> = {}) =>
    graphqlRequest<T>(options, query, variables);

  const { viewer } = await graphql<ViewerData>(VIEWER_QUERY);
  const sensitive = new SensitiveNames();
  sensitive.allow(viewer.login);

  const cachedYears = options.cache?.login === viewer.login ? options.cache.years : {};
  const years: Record<string, GitHubYear> = {};
  const firstYear = new Date(viewer.createdAt).getUTCFullYear();
  const thisYear = now.getUTCFullYear();

  for (let year = firstYear; year <= thisYear; year++) {
    const cached = cachedYears[year];
    if (cached?.complete) {
      years[year] = cached;
      continue;
    }
    const from = year === firstYear ? viewer.createdAt : `${year}-01-01T00:00:00Z`;
    const yearEnd = new Date(`${year}-12-31T23:59:59Z`);
    const to = yearEnd < now ? yearEnd : now;
    const data = await graphql<YearData>(YEAR_QUERY, { from, to: to.toISOString() });
    years[year] = toYear(data, yearEnd < now);
  }

  const languages: Record<string, LanguageStat> = {};
  const repos = { public: 0, private: 0 };
  let stars = 0;
  const affiliations = options.includeOrgRepos === false ? ["OWNER"] : ["OWNER", "ORGANIZATION_MEMBER"];
  let after: string | null = null;
  do {
    const data: ReposData = await graphql<ReposData>(REPOS_QUERY, { after, affiliations });
    const page = data.viewer.repositories;
    for (const repo of page.nodes) {
      if (isExcluded(options.excludeRepos, repo.name, repo.nameWithOwner)) continue;
      if (repo.isPrivate) {
        sensitive.add(repo.name, repo.nameWithOwner);
        repos.private++;
      } else {
        repos.public++;
      }
      stars += repo.stargazerCount;
      for (const { size, node } of repo.languages.edges) {
        const stat = (languages[node.name] ??= { size: 0, repos: 0, color: node.color });
        stat.size += size;
        stat.repos++;
      }
    }
    after = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null;
  } while (after);

  const totals = emptyTotals();
  const days: Record<DateKey, number> = {};
  for (const year of Object.values(years)) {
    totals.contributions += year.contributions;
    totals.commits += year.commits;
    totals.pullRequests += year.pullRequests;
    totals.issues += year.issues;
    totals.reviews += year.reviews;
    Object.assign(days, year.days);
  }
  totals.stars = stars;
  totals.followers = viewer.followers.totalCount;
  totals.contributedTo = viewer.repositoriesContributedTo.totalCount;

  return {
    activity: { host: "github", login: viewer.login, days, totals, languages, repos },
    cache: { login: viewer.login, years },
    sensitive,
  };
}

function toYear(data: YearData, complete: boolean): GitHubYear {
  const collection = data.viewer.contributionsCollection;
  const days: Record<DateKey, number> = {};
  for (const week of collection.contributionCalendar.weeks) {
    for (const day of week.contributionDays) {
      if (day.contributionCount > 0) days[day.date] = day.contributionCount;
    }
  }
  return {
    complete,
    days,
    contributions: collection.contributionCalendar.totalContributions,
    commits: collection.totalCommitContributions,
    pullRequests: collection.totalPullRequestContributions,
    issues: collection.totalIssueContributions,
    reviews: collection.totalPullRequestReviewContributions,
  };
}

async function graphqlRequest<T>(
  options: GitHubOptions,
  query: string,
  variables: Record<string, unknown>,
): Promise<T> {
  const response = await request(
    options.apiUrl ?? "https://api.github.com/graphql",
    {
      method: "POST",
      headers: {
        authorization: `bearer ${options.token}`,
        "content-type": "application/json",
        "user-agent": "git-info-combine",
      },
      body: JSON.stringify({ query, variables }),
    },
    options,
  );
  const body = (await response.json()) as { data?: T; errors?: { type?: string }[] };
  if (body.errors?.length || !body.data) {
    // GraphQL error messages can quote repo names, so only the error types are reported.
    const types = body.errors?.map((error) => error.type ?? "UNKNOWN").join(", ") ?? "no data";
    throw new Error(`GitHub GraphQL request failed: ${types}`);
  }
  return body.data;
}
