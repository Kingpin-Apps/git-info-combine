import { combine } from "./combine.ts";
import { fetchGitHub, type GitHubCache } from "./github.ts";
import { fetchGitLab, type GitLabCache } from "./gitlab.ts";
import type { HttpOptions } from "./http.ts";
import type { CombinedActivity, HostActivity } from "./model.ts";
import { SensitiveNames } from "./privacy.ts";

export const CACHE_VERSION = 1;

export interface Cache {
  version: typeof CACHE_VERSION;
  github?: GitHubCache;
  gitlab?: GitLabCache;
}

export interface CollectOptions extends HttpOptions {
  githubToken?: string;
  gitlabToken?: string;
  gitlabUrl?: string;
  /** See GitHubOptions.includeOrgRepos. */
  includeOrgRepos?: boolean;
  /** Repos or projects to leave out of languages and stars, on any host. */
  excludeRepos?: string[];
  /** GitLab project paths that mirror GitHub repos, on top of the ones spotted automatically. */
  gitlabMirrors?: string[];
  /** Count a repo that bundles WordPress core as one PHP repo. Defaults to true. */
  detectWordPress?: boolean;
  cache?: Cache;
  now?: Date;
}

export interface Collected {
  activity: CombinedActivity;
  /** GitLab projects counted once because they mirror a GitHub repo. */
  mirrored: number;
  cache: Cache;
  /** Names that must never be written out. Kept in memory only. */
  sensitive: SensitiveNames;
}

/** Fetches every configured host, combines the results and checks no private name got through. */
export async function collect(options: CollectOptions): Promise<Collected> {
  const hosts: HostActivity[] = [];
  let mirrored = 0;
  const cache: Cache = { version: CACHE_VERSION };
  const sensitive = new SensitiveNames();
  let githubHeads: Set<string> | undefined;

  if (options.githubToken) {
    const result = await fetchGitHub({ ...options, token: options.githubToken, cache: options.cache?.github });
    hosts.push(result.activity);
    cache.github = result.cache;
    sensitive.merge(result.sensitive);
    githubHeads = result.heads;
  }

  if (options.gitlabToken) {
    const result = await fetchGitLab({
      ...options,
      token: options.gitlabToken,
      baseUrl: options.gitlabUrl,
      cache: options.cache?.gitlab,
      githubHeads,
      mirrors: options.gitlabMirrors,
    });
    hosts.push(result.activity);
    mirrored = result.mirrored;
    cache.gitlab = result.cache;
    sensitive.merge(result.sensitive);
  }

  if (hosts.length === 0) throw new Error("Set at least one of github-token and gitlab-token.");

  const activity = combine(hosts, options.now);
  sensitive.assertAbsent(activity, "the activity data");
  sensitive.assertAbsent(cache, "the cache");
  return { activity, mirrored, cache, sensitive };
}

/** Reads a cache file's text. Anything unreadable or from another version starts fresh. */
export function parseCache(text: string | null | undefined): Cache | undefined {
  if (!text) return undefined;
  try {
    const cache = JSON.parse(text) as Cache;
    return cache?.version === CACHE_VERSION ? cache : undefined;
  } catch {
    return undefined;
  }
}
