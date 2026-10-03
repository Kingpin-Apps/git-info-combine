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
  /** Number of repos or projects that use the language. */
  repos: number;
  color: string | null;
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
