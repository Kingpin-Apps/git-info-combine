import type { CombinedActivity, Totals } from "../model.ts";
import { hostLegend, type HostColors } from "./hosts.ts";
import { ICONS, type IconName } from "./icons.ts";
import { calculateRank } from "./rank.ts";
import { formatNumber, renderFrame, titleOffset, type CardOptions } from "./svg.ts";

export const STAT_NAMES = ["stars", "commits", "pullRequests", "issues", "reviews", "contributedTo"] as const;
export type StatName = (typeof STAT_NAMES)[number];

const ROWS: Record<StatName, { label: string; icon: IconName }> = {
  stars: { label: "Total Stars Earned:", icon: "star" },
  commits: { label: "Total Commits:", icon: "commits" },
  pullRequests: { label: "Total PRs / MRs:", icon: "prs" },
  issues: { label: "Total Issues:", icon: "issues" },
  reviews: { label: "Total Reviews:", icon: "reviews" },
  contributedTo: { label: "Contributed to:", icon: "contribs" },
};

export interface StatsCardOptions extends CardOptions {
  /** Name in the title. Defaults to the GitHub login, else the GitLab one. */
  name?: string;
  hide?: StatName[];
  hideRank?: boolean;
  /** Show which hosts the numbers come from. Defaults to true. */
  showHosts?: boolean;
  hostColors?: HostColors;
  numberFormat?: "short" | "long";
}

const LINE_HEIGHT = 25;

export function renderStatsCard(activity: CombinedActivity, options: StatsCardOptions = {}): string {
  const totals: Totals = activity.totals;
  const name = options.name ?? (activity.hosts.find((h) => h.host === "github") ?? activity.hosts[0])?.login ?? "";
  const rows = STAT_NAMES.filter((stat) => !options.hide?.includes(stat));
  const showRank = !options.hideRank;
  const showHosts = options.showHosts !== false && activity.hosts.length > 0;

  const width = showRank ? 450 : 300;
  const top = titleOffset(options);
  const rowsHeight = rows.length * LINE_HEIGHT;
  const legendHeight = showHosts ? 30 : 0;
  const height = Math.max(top + rowsHeight + legendHeight, showRank ? 175 : 0);

  const body: string[] = [];
  rows.forEach((stat, i) => {
    const { label, icon } = ROWS[stat];
    const y = i * LINE_HEIGHT;
    body.push(
      `<g transform="translate(25 ${y})">`,
      `<svg class="icon" x="0" y="-13" viewBox="0 0 16 16" width="16" height="16">${ICONS[icon]}</svg>`,
      `<text class="text bold" x="25" y="0">${label}</text>`,
      `<text class="text bold" x="185" y="0">${formatNumber(totals[stat], options.numberFormat)}</text>`,
      `</g>`,
    );
  });

  if (showHosts) {
    const legend = hostLegend(
      activity.hosts.map((h) => h.host),
      options.hostColors ?? {},
      25,
      rowsHeight + 12,
    );
    body.push(legend.svg);
  }

  let rankText = "";
  if (showRank) {
    const rank = calculateRank(totals);
    const radius = 40;
    const circumference = 2 * Math.PI * radius;
    const progress = Math.max(0, Math.min(100, 100 - rank.percentile));
    const cx = width - 85;
    const cy = (height - top) / 2 - 18;
    body.push(
      `<g transform="translate(${cx} ${cy})">`,
      `<circle r="${radius}" stroke="var(--icon)" stroke-opacity="0.2" stroke-width="6" fill="none"/>`,
      `<circle r="${radius}" stroke="var(--icon)" stroke-width="6" fill="none" stroke-linecap="round" transform="rotate(-90)" stroke-dasharray="${circumference.toFixed(2)}" stroke-dashoffset="${(circumference * (1 - progress / 100)).toFixed(2)}"/>`,
      `<text class="title" x="0" y="0" text-anchor="middle" dominant-baseline="central" style="font-size:24px;font-weight:800;fill:var(--text)">${rank.level}</text>`,
      `</g>`,
    );
    rankText = `, rank ${rank.level}`;
  }

  const description = rows.map((stat) => `${ROWS[stat].label} ${totals[stat]}`).join(", ") + rankText;
  return renderFrame({
    ...options,
    width,
    height,
    title: `${name}'s Git Stats`,
    description,
    body: body.join(""),
  });
}
