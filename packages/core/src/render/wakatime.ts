import { LANGUAGE_COLORS } from "./language-colors.ts";
import { escapeXml, renderFrame, titleOffset, type CardOptions } from "./svg.ts";
import type { WakaTimeRange, WakaTimeStats } from "../wakatime.ts";

export interface WakaTimeCardOptions extends CardOptions {
  layout?: "normal" | "compact";
  /** How many languages to show. Default 6. */
  count?: number;
  hide?: string[];
}

const RANGE_LABELS: Record<WakaTimeRange, string> = {
  last_7_days: "last 7 days",
  last_30_days: "last 30 days",
  last_6_months: "last 6 months",
  last_year: "last year",
  all_time: "all time",
};

const WIDTH = 450;
const BAR_WIDTH = WIDTH - 50;

export function renderWakaTimeCard(stats: WakaTimeStats, options: WakaTimeCardOptions = {}): string {
  const hidden = new Set((options.hide ?? []).map((name) => name.toLowerCase()));
  const languages = stats.languages
    .filter((language) => !hidden.has(language.name.toLowerCase()) && language.percent > 0)
    .slice(0, options.count ?? 6)
    .map((language) => ({ ...language, color: LANGUAGE_COLORS[language.name] ?? "#858585" }));
  const top = titleOffset(options);
  const summary = `${stats.total} in the ${RANGE_LABELS[stats.range]}`.replace("in the all time", "of all time");

  const body: string[] = [`<text class="small" x="25" y="0">${escapeXml(summary)}</text>`];
  let height: number;
  if (!stats.ready || languages.length === 0) {
    body.push(`<text class="small" x="25" y="30">${stats.ready ? "No coding activity yet." : "WakaTime is still calculating these stats."}</text>`);
    height = top + 50;
  } else if (options.layout === "compact") {
    let x = 0;
    const segments = languages.map((language) => {
      const width = (language.percent / 100) * BAR_WIDTH;
      const segment = `<rect x="${x.toFixed(2)}" y="0" width="${width.toFixed(2)}" height="8" fill="${language.color}"/>`;
      x += width;
      return segment;
    });
    body.push(
      `<clipPath id="waka-bar"><rect x="0" y="0" width="${BAR_WIDTH}" height="8" rx="4"/></clipPath>`,
      `<rect x="25" y="17" width="${BAR_WIDTH}" height="8" rx="4" fill="var(--text)" fill-opacity="0.15"/>`,
      `<g transform="translate(25 17)"><g clip-path="url(#waka-bar)">${segments.join("")}</g></g>`,
    );
    languages.forEach((language, i) => {
      const lx = 25 + (i % 2) * 210;
      const ly = 50 + Math.floor(i / 2) * 25;
      body.push(
        `<circle cx="${lx + 5}" cy="${ly - 4}" r="5" fill="${language.color}"/>`,
        `<text class="small" x="${lx + 15}" y="${ly}">${escapeXml(language.name)} – ${escapeXml(language.text)}</text>`,
      );
    });
    height = top + 40 + Math.ceil(languages.length / 2) * 25;
  } else {
    languages.forEach((language, i) => {
      const y = 30 + i * 30;
      body.push(
        `<text class="small" x="25" y="${y}">${escapeXml(language.name)}</text>`,
        `<text class="small" x="${WIDTH - 25}" y="${y}" text-anchor="end">${escapeXml(language.text)}</text>`,
        `<rect x="160" y="${y - 9}" width="${BAR_WIDTH - 230}" height="8" rx="4" fill="var(--text)" fill-opacity="0.15"/>`,
        `<rect x="160" y="${y - 9}" width="${Math.max(((BAR_WIDTH - 230) * language.percent) / 100, 2).toFixed(2)}" height="8" rx="4" fill="${language.color}"/>`,
      );
    });
    height = top + 30 + languages.length * 30 - 5;
  }

  return renderFrame({
    ...options,
    width: WIDTH,
    height,
    title: "WakaTime Stats",
    description: `${summary}. ${languages.map((l) => `${l.name} ${l.text}`).join(", ")}`,
    body: body.join(""),
  });
}
