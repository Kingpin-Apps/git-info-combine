import type { ShowcaseItem } from "../showcase.ts";
import { hostColor, type HostColors } from "./hosts.ts";
import { ICONS } from "./icons.ts";
import { LANGUAGE_COLORS } from "./language-colors.ts";
import { escapeXml, formatNumber, HOST_LABELS, renderFrame, wrapText, type CardOptions } from "./svg.ts";

export interface ShowcaseCardOptions extends CardOptions {
  /** Show which host the repo or gist is on. Defaults to true. */
  showHost?: boolean;
  hostColors?: HostColors;
  /** Lines of description before it is cut. Default 3. */
  descriptionLines?: number;
}

/** A card for one pinned repo or project, or one gist or snippet, like GitHub Stats Extended's. */
export function renderShowcaseCard(item: ShowcaseItem, options: ShowcaseCardOptions = {}): string {
  const WIDTH = options.width ?? 400;
  // About 6.6 px per character of 12 px text.
  const lineLength = Math.floor((WIDTH - 50) / 6.6);
  const description = wrapText(item.description ?? "No description provided.", lineLength, options.descriptionLines ?? 3);
  const badge = item.archived ? "Archived" : null;
  const top = options.hideTitle ? 15 : 0;

  const body: string[] = [];
  const titleY = 35 - top;
  if (!options.hideTitle) {
    body.push(
      `<svg class="icon" x="25" y="${titleY - 13}" viewBox="0 0 16 16" width="16" height="16">${ICONS.repo}</svg>`,
      `<text class="title" x="48" y="${titleY}" style="font-size:16px">${escapeXml(item.title)}</text>`,
    );
    if (badge) {
      const x = 48 + item.title.length * 9 + 10;
      body.push(
        `<rect x="${x}" y="${titleY - 14}" width="62" height="20" rx="10" fill="none" stroke="var(--text)" stroke-opacity="0.5"/>`,
        `<text class="small" x="${x + 31}" y="${titleY}" text-anchor="middle">${badge}</text>`,
      );
    }
  }
  description.forEach((line, i) => {
    body.push(`<text class="small" x="25" y="${titleY + 25 + i * 18}">${escapeXml(line)}</text>`);
  });

  const footerY = titleY + 25 + description.length * 18 + 15;
  let x = 25;
  if (item.language) {
    const color = item.language.color ?? LANGUAGE_COLORS[item.language.name] ?? "#858585";
    body.push(
      `<circle cx="${x + 6}" cy="${footerY - 4}" r="6" fill="${color}"/>`,
      `<text class="small" x="${x + 17}" y="${footerY}">${escapeXml(item.language.name)}</text>`,
    );
    x += 17 + item.language.name.length * 7 + 18;
  }
  for (const [path, count] of [[ICONS.star, item.stars], [ICONS.fork, item.forks]] as const) {
    if (item.host === "gitlab" && item.kind === "gist") break; // GitLab snippets have no stars or forks.
    body.push(
      `<svg class="icon" x="${x}" y="${footerY - 12}" viewBox="0 0 16 16" width="16" height="16">${path}</svg>`,
      `<text class="small" x="${x + 22}" y="${footerY}">${formatNumber(count)}</text>`,
    );
    x += 22 + formatNumber(count).length * 7 + 18;
  }
  if (options.showHost !== false) {
    body.push(
      `<circle cx="${WIDTH - 25 - HOST_LABELS[item.host].length * 7 - 12}" cy="${footerY - 4}" r="5" fill="${hostColor(item.host, options.hostColors)}"/>`,
      `<text class="small" x="${WIDTH - 25}" y="${footerY}" text-anchor="end">${HOST_LABELS[item.host]}</text>`,
    );
  }

  const kind = item.kind === "repo" ? (item.host === "github" ? "Repository" : "Project") : item.host === "github" ? "Gist" : "Snippet";
  return renderFrame({
    ...options,
    hideTitle: true,
    width: WIDTH,
    height: footerY + 20,
    title: item.title,
    description: `${kind} ${item.path} on ${HOST_LABELS[item.host]}: ${item.description ?? ""}`,
    body: `<g transform="translate(0 -35)">${body.join("")}</g>`,
  });
}
