export type Host = "github" | "gitlab";

/** Date in `YYYY-MM-DD` form (UTC). */
export type DateKey = string;

export interface Totals {
  /** Contribution-calendar events: commits, PRs/MRs, issues, reviews, comments. */
  contributions: number;
  commits: number;
  pullRequests: number;
  issues: number;
  reviews: number;
  stars: number;
  followers: number;
  contributedTo: number;
}

export interface LanguageStat {
  /** Approximate size in bytes. */
  size: number;
  /**
   * The language's share of each repo, added up: a repo that is 75% Swift adds
   * 0.75. Every repo counts once, whatever its size.
   */
  weight: number;
  /** Number of repos or projects that use the language. */
  repos: number;
  color: string | null;
}

/**
 * Adds one repo's languages to a running total. `sizes` are bytes or any
 * unit proportional to them. A WordPress site counts as one PHP repo, since
 * the bundled WordPress core is not the user's code.
 */
export function addRepoLanguages(
  languages: Record<string, LanguageStat>,
  sizes: Record<string, { size: number; color: string | null }>,
  wordpress = false,
): void {
  if (wordpress) {
    const php = (languages.PHP ??= { size: 0, weight: 0, repos: 0, color: null });
    php.weight += 1;
    php.repos += 1;
    return;
  }
  const total = Object.values(sizes).reduce((sum, { size }) => sum + size, 0);
  if (total <= 0) return;
  for (const [name, { size, color }] of Object.entries(sizes)) {
    if (size <= 0) continue;
    const stat = (languages[name] ??= { size: 0, weight: 0, repos: 0, color });
    stat.size += size;
    stat.weight += size / total;
    stat.repos += 1;
    stat.color ??= color;
  }
}

/**
 * Activity for one host. It holds no repo, project, gist or snippet names, so
 * nothing private can reach a card or the cache through it.
 */
export interface HostActivity {
  host: Host;
  login: string;
  days: Record<DateKey, number>;
  totals: Totals;
  languages: Record<string, LanguageStat>;
  repos: { public: number; private: number };
}

export interface CombinedActivity {
  generatedAt: string;
  hosts: HostActivity[];
  /** Calendar counts per day, added up across hosts. */
  days: Record<DateKey, number>;
  totals: Totals;
  languages: Record<string, LanguageStat>;
}

export function emptyTotals(): Totals {
  return {
    contributions: 0,
    commits: 0,
    pullRequests: 0,
    issues: 0,
    reviews: 0,
    stars: 0,
    followers: 0,
    contributedTo: 0,
  };
}

export type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

export function toDateKey(date: Date | string): DateKey {
  return (typeof date === "string" ? date : date.toISOString()).slice(0, 10);
}

export function addDays(day: DateKey, delta: number): DateKey {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + delta);
  return toDateKey(date);
}
