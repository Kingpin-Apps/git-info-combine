import { addDays, toDateKey, type CombinedActivity, type DateKey, type Host } from "../model.ts";
import { hostColor, hostLegend, type HostColors } from "./hosts.ts";
import { formatNumber, renderFrame, titleOffset, type CardOptions } from "./svg.ts";

export interface HeatmapCardOptions extends CardOptions {
  /** `last-year` (the default) shows 53 weeks; `all` shows every calendar year, newest first. */
  range?: "last-year" | "all";
  /**
   * `hosts` (the default) splits each day's square by host colour; `single`
   * uses one colour, the theme's icon colour.
   */
  mode?: "hosts" | "single";
  hostColors?: HostColors;
}

const CELL = 10;
const STEP = 13;
const LEFT = 25 + 30;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const OPACITY = [0, 0.4, 0.6, 0.8, 1];

interface Day {
  total: number;
  byHost: [Host, number][];
}

export function renderHeatmapCard(activity: CombinedActivity, options: HeatmapCardOptions = {}): string {
  const today = toDateKey(activity.generatedAt);
  const range = options.range ?? "last-year";
  const mode = options.mode ?? "hosts";
  const hosts = activity.hosts.map((h) => h.host);
  const colors = Object.fromEntries(hosts.map((host) => [host, hostColor(host, options.hostColors)])) as Record<Host, string>;
  const single = "var(--icon)";

  const days = (date: DateKey): Day => {
    const byHost = activity.hosts
      .map((h) => [h.host, h.days[date] ?? 0] as [Host, number])
      .filter(([, count]) => count > 0);
    return { total: byHost.reduce((sum, [, count]) => sum + count, 0), byHost };
  };

  const blocks: { start: DateKey; end: DateKey; label?: string }[] = [];
  if (range === "all") {
    const first = Object.keys(activity.days)[0] ?? today;
    for (let year = Number(today.slice(0, 4)); year >= Number(first.slice(0, 4)); year--) {
      blocks.push({ start: `${year}-01-01`, end: year === Number(today.slice(0, 4)) ? today : `${year}-12-31`, label: String(year) });
    }
  } else {
    blocks.push({ start: addDays(today, -364), end: today });
  }

  const thresholds = levels(blocks.flatMap((block) => datesBetween(block.start, block.end).map((d) => days(d).total)));
  const level = (count: number) => (count === 0 ? 0 : 1 + thresholds.filter((t) => count > t).length);

  const top = titleOffset(options);
  const blockHeight = 15 + 7 * STEP + 10;
  const body: string[] = [];
  let total = 0;
  let width = 0;

  blocks.forEach((block, b) => {
    const y0 = b * (blockHeight + (block.label ? 20 : 0)) + (block.label ? 20 : 0);
    const gridStart = sundayOnOrBefore(block.start);
    const empty: string[] = [];
    const filled: string[] = [];
    let lastMonth = -1;
    let blockTotal = 0;
    let columns = 0;

    for (let date = gridStart, i = 0; date <= block.end; date = addDays(date, 1), i++) {
      const column = Math.floor(i / 7);
      const row = i % 7;
      columns = column + 1;
      if (date < block.start) continue;
      const x = LEFT + column * STEP;
      const y = y0 + 15 + row * STEP;

      const month = Number(date.slice(5, 7)) - 1;
      if (month !== lastMonth && row === 0) {
        if (lastMonth !== -1 || Number(date.slice(8)) <= 7) body.push(`<text class="small" x="${x}" y="${y0 + 8}">${MONTHS[month]}</text>`);
        lastMonth = month;
      }

      const day = days(date);
      blockTotal += day.total;
      if (day.total === 0) {
        empty.push(`M${x} ${y}h${CELL}v${CELL}h-${CELL}z`);
        continue;
      }
      const opacity = OPACITY[level(day.total)];
      if (mode === "single" || day.byHost.length === 1) {
        const fill = mode === "single" ? single : colors[day.byHost[0]![0]];
        filled.push(`<rect x="${x}" y="${y}" width="${CELL}" height="${CELL}" rx="2" fill="${fill}" fill-opacity="${opacity}"/>`);
      } else {
        // Stack each host's share of the day, top to bottom, in host order.
        let offset = 0;
        const parts = day.byHost.map(([host, count], index) => {
          const height = index === day.byHost.length - 1 ? CELL - offset : Math.round((count / day.total) * CELL * 10) / 10;
          const part = `<rect x="${x}" y="${(y + offset).toFixed(1)}" width="${CELL}" height="${height.toFixed(1)}" fill="${colors[host]}"/>`;
          offset += height;
          return part;
        });
        filled.push(`<g fill-opacity="${opacity}">${parts.join("")}</g>`);
      }
    }

    total += blockTotal;
    width = Math.max(width, LEFT + columns * STEP + 25);
    if (block.label) {
      body.push(`<text class="text bold" x="25" y="${y0 - 6}">${block.label}</text>`);
      body.push(`<text class="small" x="${25 + 45}" y="${y0 - 6}">${formatNumber(blockTotal, "long")} contributions</text>`);
    }
    for (const [row, name] of [[1, "Mon"], [3, "Wed"], [5, "Fri"]] as const) {
      body.push(`<text class="small" x="25" y="${y0 + 15 + row * STEP + 9}">${name}</text>`);
    }
    body.push(`<path d="${empty.join("")}" fill="var(--text)" fill-opacity="0.12"/>`);
    body.push(...filled);
  });

  const legendY = blocks.length * blockHeight + blocks.filter((block) => block.label).length * 20 + 10;
  if (mode === "hosts") body.push(hostLegend(hosts, options.hostColors ?? {}, 25, legendY).svg);
  const scaleX = width - 25 - 5 * STEP - 70;
  body.push(`<text class="small" x="${scaleX}" y="${legendY}">Less</text>`);
  OPACITY.forEach((opacity, i) => {
    const x = scaleX + 32 + i * STEP;
    body.push(
      i === 0
        ? `<rect x="${x}" y="${legendY - 9}" width="${CELL}" height="${CELL}" rx="2" fill="var(--text)" fill-opacity="0.12"/>`
        : `<rect x="${x}" y="${legendY - 9}" width="${CELL}" height="${CELL}" rx="2" fill="${mode === "single" ? single : "var(--text)"}" fill-opacity="${opacity}"/>`,
    );
  });
  body.push(`<text class="small" x="${scaleX + 32 + 5 * STEP + 3}" y="${legendY}">More</text>`);

  const since = blocks.at(-1)!.start.slice(0, 4);
  const title =
    range === "all"
      ? `${formatNumber(total, "long")} contributions since ${since}`
      : `${formatNumber(total, "long")} contributions in the last year`;
  const hostNames = hosts.map((host) => (host === "github" ? "GitHub" : "GitLab")).join(" and ");

  return renderFrame({
    ...options,
    width,
    height: top + legendY + 20,
    title,
    description: `Contribution calendar combining ${hostNames}: ${title}.`,
    body: body.join(""),
  });
}

/** GitHub-style levels: quartiles of the days that have any activity. */
function levels(counts: number[]): number[] {
  const active = counts.filter((count) => count > 0).sort((a, b) => a - b);
  if (active.length === 0) return [0, 0, 0];
  return [0.25, 0.5, 0.75].map((q) => active[Math.min(active.length - 1, Math.floor(q * active.length))]!);
}

function datesBetween(start: DateKey, end: DateKey): DateKey[] {
  const dates: DateKey[] = [];
  for (let date = start; date <= end; date = addDays(date, 1)) dates.push(date);
  return dates;
}

function sundayOnOrBefore(date: DateKey): DateKey {
  return addDays(date, -new Date(`${date}T00:00:00Z`).getUTCDay());
}
