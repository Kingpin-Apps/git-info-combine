/*
The rank formula from GitHub Stats Extended
(https://github.com/stats-organization/github-stats-extended/blob/master/packages/core/src/calculateRank.ts),
used under the MIT License. Copyright (c) 2020 Anurag Hazra, Abhijit Gupta, martin-mfg.
See themes.ts for the full licence text.
*/

const exponentialCdf = (x: number) => 1 - 2 ** -x;
const logNormalCdf = (x: number) => x / (1 + x);

export interface RankInput {
  commits: number;
  pullRequests: number;
  issues: number;
  reviews: number;
  stars: number;
  followers: number;
}

export interface Rank {
  level: string;
  /** Lower is better: 1 means the top 1%. */
  percentile: number;
}

/**
 * GitHub Stats Extended's rank, using its all-commits median, since the
 * commit counts here cover every year.
 */
export function calculateRank(input: RankInput): Rank {
  const weighted = [
    [2, exponentialCdf(input.commits / 1000)],
    [3, exponentialCdf(input.pullRequests / 50)],
    [1, exponentialCdf(input.issues / 25)],
    [1, exponentialCdf(input.reviews / 2)],
    [4, logNormalCdf(input.stars / 50)],
    [1, logNormalCdf(input.followers / 10)],
  ] as const;
  const totalWeight = weighted.reduce((sum, [weight]) => sum + weight, 0);
  const rank = 1 - weighted.reduce((sum, [weight, value]) => sum + weight * value, 0) / totalWeight;

  const thresholds = [1, 12.5, 25, 37.5, 50, 62.5, 75, 87.5, 100];
  const levels = ["S", "A+", "A", "A-", "B+", "B", "B-", "C+", "C"];
  const level = levels[thresholds.findIndex((t) => rank * 100 <= t)] ?? "C";
  return { level, percentile: rank * 100 };
}
