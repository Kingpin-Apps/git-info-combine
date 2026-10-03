import type { CombinedActivity, Host, Totals } from "../model.ts";
import { hostColor, type HostColors } from "./hosts.ts";
import { formatNumber, HOST_LABELS, renderFrame, titleOffset, type CardOptions } from "./svg.ts";

export interface HostSplitCardOptions extends CardOptions {
  hostColors?: HostColors;
}

const METRICS: { key: keyof Totals; label: string }[] = [
  { key: "commits", label: "Commits" },
  { key: "pullRequests", label: "PRs / MRs" },
  { key: "issues", label: "Issues" },
];

/**
 * How activity splits between the hosts: a donut of contributions, then a
 * split bar for commits, PRs/MRs and issues.
 */
export function renderHostSplitCard(activity: CombinedActivity, options: HostSplitCardOptions = {}): string {
  const width = options.width ?? 300;
  const top = titleOffset(options);
  const hosts = activity.hosts.map((h) => h.host);
  const color = (host: Host) => hostColor(host, options.hostColors);
  const share = (key: keyof Totals) => {
    const total = activity.hosts.reduce((sum, h) => sum + h.totals[key], 0);
    return activity.hosts.map((h) => ({ host: h.host, value: h.totals[key], percent: total ? (h.totals[key] / total) * 100 : 0 }));
  };

  const body: string[] = [];

  // Donut of contributions, with the total in the middle and a legend beside it.
  const radius = 40;
  const cx = 25 + radius + 7;
  const cy = radius - 6;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  body.push(`<circle cx="${cx}" cy="${cy}" r="${radius}" fill="none" stroke="var(--text)" stroke-opacity="0.15" stroke-width="14"/>`);
  for (const part of share("contributions")) {
    const length = (part.percent / 100) * circumference;
    if (length <= 0) continue;
    body.push(
      `<circle cx="${cx}" cy="${cy}" r="${radius}" fill="none" stroke="${color(part.host)}" stroke-width="14" stroke-dasharray="${length.toFixed(2)} ${(circumference - length).toFixed(2)}" stroke-dashoffset="${(-offset).toFixed(2)}" transform="rotate(-90 ${cx} ${cy})"/>`,
    );
    offset += length;
  }
  body.push(
    `<text class="text bold" x="${cx}" y="${cy - 1}" text-anchor="middle">${formatNumber(activity.totals.contributions)}</text>`,
    `<text class="small" x="${cx}" y="${cy + 13}" text-anchor="middle" style="font-size:9px">contributions</text>`,
  );
  share("contributions").forEach((part, i) => {
    const lx = cx + radius + 22;
    const ly = cy - 8 + i * 22;
    body.push(
      `<circle cx="${lx + 5}" cy="${ly - 4}" r="5" fill="${color(part.host)}"/>`,
      `<text class="small" x="${lx + 15}" y="${ly}"><tspan class="bold">${HOST_LABELS[part.host]}</tspan> ${part.percent.toFixed(0)}%</text>`,
    );
  });

  // A split bar per metric.
  const barWidth = width - 50;
  METRICS.forEach(({ key, label }, i) => {
    const y = 2 * radius + 24 + i * 40;
    const parts = share(key);
    body.push(
      `<text class="small" x="25" y="${y}">${label}</text>`,
      `<text class="small" x="${width - 25}" y="${y}" text-anchor="end">${parts.map((p) => formatNumber(p.value)).join(" · ")}</text>`,
      `<clipPath id="split-${key}"><rect x="25" y="${y + 8}" width="${barWidth}" height="8" rx="4"/></clipPath>`,
      `<rect x="25" y="${y + 8}" width="${barWidth}" height="8" rx="4" fill="var(--text)" fill-opacity="0.15"/>`,
    );
    let x = 25;
    const segments = parts.map((part) => {
      const w = (part.percent / 100) * barWidth;
      const rect = `<rect x="${x.toFixed(2)}" y="${y + 8}" width="${w.toFixed(2)}" height="8" fill="${color(part.host)}"/>`;
      x += w;
      return rect;
    });
    body.push(`<g clip-path="url(#split-${key})">${segments.join("")}</g>`);
  });

  const height = top + 2 * radius + 24 + METRICS.length * 40 - 5;
  const description = [
    ...share("contributions").map((p) => `${HOST_LABELS[p.host]} ${p.percent.toFixed(0)}% of contributions`),
    ...METRICS.map(({ key, label }) => `${label}: ${share(key).map((p) => `${HOST_LABELS[p.host]} ${p.value}`).join(", ")}`),
  ].join(". ");

  return renderFrame({
    ...options,
    width,
    height,
    title: hosts.length > 1 ? "Activity by Host" : `Activity on ${HOST_LABELS[hosts[0] ?? "github"]}`,
    description,
    body: body.join(""),
  });
}
