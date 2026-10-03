import { escapeXml, svgHeight, svgWidth, type CardOptions } from "./svg.ts";

/** Draws a card with extra options, such as a width, a minimum height or a theme. */
export type CardRenderer = (extra: CardOptions) => string;

export interface LayoutOptions {
  /** Width of every row, in pixels. Default 800. */
  width?: number;
  /** Space between cards, across and down. Default 10. */
  gap?: number;
  /** Options for every card, such as a theme. */
  extra?: CardOptions;
  /** Title of the combined image, for screen readers. */
  title?: string;
}

export interface Layout {
  /** One image per row, each exactly `width` wide. */
  rows: string[];
  /** Every row stacked into one image, with `gap` between rows. */
  combined: string;
}

interface PlacedRow {
  height: number;
  /** Cards nested at their x positions, with y = 0. */
  cards: { svg: string; x: number }[];
  titles: string[];
}

/**
 * Lays out rows of cards so every row has the same width, cards in a row share
 * one height, and the gaps across and down are equal. Each card keeps its own
 * proportions: a row's width is shared out in proportion to the cards' default widths.
 */
export function renderLayout(rows: CardRenderer[][], options: LayoutOptions = {}): Layout {
  const width = options.width ?? 800;
  const gap = options.gap ?? 10;
  const extra = options.extra ?? {};
  let cardIndex = 0;

  const placed: PlacedRow[] = rows
    .filter((row) => row.length > 0)
    .map((row) => {
      const natural = row.map((render) => svgWidth(render(extra)));
      const available = width - gap * (row.length - 1);
      const total = natural.reduce((sum, w) => sum + w, 0);
      const widths = natural.map((w) => Math.floor((w / total) * available));
      widths[widths.length - 1]! += available - widths.reduce((sum, w) => sum + w, 0);

      const height = Math.max(...row.map((render, i) => svgHeight(render({ ...extra, width: widths[i] }))));
      let x = 0;
      const cards = row.map((render, i) => {
        const svg = render({ ...extra, width: widths[i], minHeight: height });
        const card = { svg: nest(svg, `c${cardIndex++}`), x };
        x += widths[i]! + gap;
        return card;
      });
      return { height, cards, titles: row.map((render) => cardTitle(render(extra))) };
    });

  const rowSvgs = placed.map((row) =>
    wrap(width, row.height, row.titles.join(", "), row.cards.map((card) => place(card.svg, card.x, 0)).join("")),
  );

  let y = 0;
  const stacked: string[] = [];
  for (const row of placed) {
    stacked.push(...row.cards.map((card) => place(card.svg, card.x, y)));
    y += row.height + gap;
  }
  const combined = wrap(
    width,
    Math.max(0, y - gap),
    placed.flatMap((row) => row.titles).join(", "),
    stacked.join(""),
    options.title ?? "Git activity across GitHub and GitLab",
  );
  return { rows: rowSvgs, combined };
}

/** Gives a card's ids a prefix, so cards in one image cannot clash, and turns its root into a nested svg. */
function nest(svg: string, prefix: string): string {
  return svg
    .replace(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" /, "<svg ")
    .replace(/\bid="([^"]+)"/g, `id="${prefix}-$1"`)
    .replace(/url\(#([^)]+)\)/g, `url(#${prefix}-$1)`)
    .replace(/aria-labelledby="([^"]+)"/, (_, ids: string) => `aria-labelledby="${ids.split(" ").map((id) => `${prefix}-${id}`).join(" ")}"`);
}

function place(svg: string, x: number, y: number): string {
  return svg.replace(/^<svg /, `<svg x="${x}" y="${y}" `);
}

function cardTitle(svg: string): string {
  return svg.match(/<title[^>]*>([^<]*)<\/title>/)?.[1] ?? "";
}

function wrap(width: number, height: number, description: string, body: string, title = "Git activity"): string {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="none" role="img" aria-labelledby="layout-title layout-desc">`,
    `<title id="layout-title">${escapeXml(title)}</title>`,
    // Card titles are already escaped.
    `<desc id="layout-desc">${description}</desc>`,
    body,
    `</svg>`,
  ].join("");
}
