import type { CombinedActivity } from "../model.ts";
import { LANGUAGE_COLORS } from "./language-colors.ts";
import { escapeXml, renderFrame, titleOffset, type CardOptions } from "./svg.ts";

export interface LanguagesCardOptions extends CardOptions {
  layout?: "normal" | "compact";
  /** How many languages to show. Defaults to 5 (normal) or 6 (compact). */
  count?: number;
  /** Language names to leave out. */
  hide?: string[];
  /**
   * `repo` (the default) counts every repo once, split by its languages.
   * `size` weighs languages by bytes, so big repos dominate.
   */
  weighting?: "repo" | "size";
}

export interface LanguageShare {
  name: string;
  color: string;
  /** Share of the shown languages, 0–100. */
  percent: number;
}

/** The top languages, as shares of the languages shown, like GitHub Stats Extended. */
export function topLanguages(
  activity: CombinedActivity,
  count: number,
  hide: string[] = [],
  weighting: "repo" | "size" = "repo",
): LanguageShare[] {
  const hidden = new Set(hide.map((name) => name.trim().toLowerCase()));
  const value = (stat: { size: number; weight: number }) => (weighting === "size" ? stat.size : stat.weight);
  const top = Object.entries(activity.languages)
    .filter(([name, stat]) => !hidden.has(name.toLowerCase()) && value(stat) > 0)
    .sort(([, a], [, b]) => value(b) - value(a))
    .slice(0, count);
  const total = top.reduce((sum, [, stat]) => sum + value(stat), 0);
  return top.map(([name, stat]) => ({
    name,
    color: stat.color ?? LANGUAGE_COLORS[name] ?? "#858585",
    percent: total ? (value(stat) / total) * 100 : 0,
  }));
}

const WIDTH = 300;
const BAR_WIDTH = WIDTH - 50;

export function renderLanguagesCard(activity: CombinedActivity, options: LanguagesCardOptions = {}): string {
  const layout = options.layout ?? "normal";
  const languages = topLanguages(activity, options.count ?? (layout === "compact" ? 6 : 5), options.hide, options.weighting);
  const top = titleOffset(options);

  let body: string;
  let height: number;
  if (languages.length === 0) {
    body = `<text class="small" x="25" y="0">No languages found.</text>`;
    height = top + 30;
  } else if (layout === "compact") {
    let x = 0;
    const segments = languages.map((language) => {
      const width = (language.percent / 100) * BAR_WIDTH;
      const segment = `<rect x="${x.toFixed(2)}" y="0" width="${width.toFixed(2)}" height="8" fill="${language.color}"/>`;
      x += width;
      return segment;
    });
    const legend = languages.map((language, i) => {
      const lx = 25 + (i % 2) * 150;
      const ly = 28 + Math.floor(i / 2) * 25;
      return `<circle cx="${lx + 5}" cy="${ly - 4}" r="5" fill="${language.color}"/><text class="small" x="${lx + 15}" y="${ly}">${escapeXml(language.name)} ${language.percent.toFixed(2)}%</text>`;
    });
    body =
      `<clipPath id="bar"><rect x="0" y="0" width="${BAR_WIDTH}" height="8" rx="4"/></clipPath>` +
      `<g transform="translate(25 -8)"><g clip-path="url(#bar)">${segments.join("")}</g></g>` +
      legend.join("");
    height = top + 18 + Math.ceil(languages.length / 2) * 25;
  } else {
    body = languages
      .map((language, i) => {
        const y = i * 40;
        const filled = Math.max((language.percent / 100) * BAR_WIDTH, 2);
        return (
          `<text class="small" x="25" y="${y}">${escapeXml(language.name)}</text>` +
          `<text class="small" x="${WIDTH - 25}" y="${y}" text-anchor="end">${language.percent.toFixed(2)}%</text>` +
          `<rect x="25" y="${y + 8}" width="${BAR_WIDTH}" height="8" rx="4" fill="var(--text)" fill-opacity="0.15"/>` +
          `<rect x="25" y="${y + 8}" width="${filled.toFixed(2)}" height="8" rx="4" fill="${language.color}"/>`
        );
      })
      .join("");
    height = top + languages.length * 40 - 5;
  }

  return renderFrame({
    ...options,
    width: WIDTH,
    height,
    title: "Most Used Languages",
    description: languages.map((l) => `${l.name} ${l.percent.toFixed(2)}%`).join(", ") || "No languages found.",
    body,
  });
}
