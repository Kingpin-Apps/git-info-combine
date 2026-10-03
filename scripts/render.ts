/**
 * Renders every card from .out/activity.json (written by `bun run fetch`)
 * into .out/cards/, with a preview page. Pass theme names to add variants:
 *
 *   bun run render radical tokyonight
 */
import { mkdir } from "node:fs/promises";
import {
  renderHeatmapCard,
  renderLanguagesCard,
  renderStatsCard,
  type CardOptions,
  type CombinedActivity,
} from "@git-info-combine/core";

const activity = (await Bun.file(".out/activity.json").json()) as CombinedActivity;
const themes = ["auto", ...process.argv.slice(2)];
const cards: [string, (options: CardOptions) => string][] = [
  ["heatmap", (o) => renderHeatmapCard(activity, o)],
  ["heatmap-single", (o) => renderHeatmapCard(activity, { ...o, mode: "single" })],
  ["heatmap-all", (o) => renderHeatmapCard(activity, { ...o, range: "all" })],
  ["stats", (o) => renderStatsCard(activity, o)],
  ["languages", (o) => renderLanguagesCard(activity, o)],
  ["languages-compact", (o) => renderLanguagesCard(activity, { ...o, layout: "compact" })],
];

await mkdir(".out/cards", { recursive: true });
const files: string[] = [];
for (const theme of themes) {
  for (const [name, render] of cards) {
    const file = theme === "auto" ? `${name}.svg` : `${name}-${theme}.svg`;
    const svg = render({ theme });
    await Bun.write(`.out/cards/${file}`, svg);
    files.push(file);
    console.log(`${file.padEnd(32)} ${(svg.length / 1024).toFixed(1)} KB`);
  }
}

await Bun.write(
  ".out/cards/index.html",
  `<!doctype html><meta charset="utf-8"><title>Git-info-combine preview</title>
<style>
  :root { color-scheme: light dark; }
  body { margin: 0; padding: 32px; font: 14px -apple-system, sans-serif; background: #fff; color: #1f2328; }
  @media (prefers-color-scheme: dark) { body { background: #0d1117; color: #e6edf3; } }
  main { max-width: 830px; margin: auto; }
  img { display: block; margin: 0 0 16px; max-width: 100%; }
  h2 { font-size: 13px; font-weight: 600; margin: 24px 0 8px; opacity: .7; }
</style>
<main>${files.map((file) => `<h2>${file}</h2><img src="${file}" alt="${file}">`).join("\n")}</main>`,
);
