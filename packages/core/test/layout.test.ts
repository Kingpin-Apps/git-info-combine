import { describe, expect, test } from "bun:test";
import { combine } from "../src/combine.ts";
import type { HostActivity } from "../src/model.ts";
import {
  renderHeatmapCard,
  renderHostSplitCard,
  renderLanguagesCard,
  renderLayout,
  renderShowcaseCard,
  renderStatsCard,
  renderWakaTimeCard,
  svgHeight,
  svgWidth,
} from "../src/render/index.ts";
import { NOW } from "./fixtures.ts";

const host = (name: "github" | "gitlab", contributions: number, commits: number): HostActivity => ({
  host: name,
  login: "octo",
  days: { "2026-10-01": contributions },
  totals: { contributions, commits, pullRequests: 4, issues: 0, reviews: 0, stars: 1, followers: 0, contributedTo: 1 },
  languages: { Swift: { size: 10, weight: 1, repos: 1, color: "#F05138" } },
  repos: { public: 1, private: 0 },
});
const activity = combine([host("github", 25, 30), host("gitlab", 75, 10)], NOW);
const item = { kind: "repo" as const, host: "github" as const, title: "app", path: "octo/app", description: "x", language: null, stars: 0, forks: 0, archived: false };
const waka = { range: "last_7_days" as const, total: "1 hr", ready: true, languages: [{ name: "Swift", percent: 100, text: "1 hr" }] };

describe("card widths", () => {
  test.each([
    ["stats", (w?: number) => renderStatsCard(activity, { width: w }), 450],
    ["languages", (w?: number) => renderLanguagesCard(activity, { width: w }), 300],
    ["hosts", (w?: number) => renderHostSplitCard(activity, { width: w }), 300],
    ["wakatime", (w?: number) => renderWakaTimeCard(waka, { width: w }), 450],
    ["pin", (w?: number) => renderShowcaseCard(item, { width: w }), 400],
  ])("%s has a default width and takes a custom one", (_, render, fallback) => {
    expect(svgWidth(render())).toBe(fallback);
    expect(svgWidth(render(512))).toBe(512);
  });

  test("a wider heatmap centres its grid", () => {
    const natural = renderHeatmapCard(activity);
    const wide = renderHeatmapCard(activity, { width: svgWidth(natural) + 40 });
    expect(svgWidth(wide)).toBe(svgWidth(natural) + 40);
    const firstLabel = (svg: string) => Number(svg.match(/<text class="small" x="(\d+)" y="\d+">Mon</)![1]);
    expect(firstLabel(wide) - firstLabel(natural)).toBe(20);
  });
});

describe("host split card", () => {
  test("splits contributions in a donut and metrics in bars", () => {
    const svg = renderHostSplitCard(activity);
    expect(svg).toContain("Activity by Host");
    expect(svg).toContain("<tspan class=\"bold\">GitHub</tspan> 25%");
    expect(svg).toContain("<tspan class=\"bold\">GitLab</tspan> 75%");
    expect(svg).toContain(">30 · 10<"); // commits
    expect(svg).toContain(">100<"); // total contributions in the middle
  });

  test("names the one host when there is only one", () => {
    expect(renderHostSplitCard(combine([host("gitlab", 5, 5)], NOW))).toContain("Activity on GitLab");
  });
});

describe("renderLayout", () => {
  const stats = (extra: object) => renderStatsCard(activity, extra);
  const languages = (extra: object) => renderLanguagesCard(activity, extra);
  const pin = (extra: object) => renderShowcaseCard(item, extra);

  test("every row is the layout width; cards share a row's height; gaps are even", () => {
    const layout = renderLayout([[stats, languages], [pin, pin]], { width: 800, gap: 10 });
    expect(layout.rows.map(svgWidth)).toEqual([800, 800]);

    const nested = (svg: string) =>
      [...svg.matchAll(/<svg x="(\d+)" y="(\d+)" width="(\d+)" height="(\d+)"/g)].map((m) => m.slice(1).map(Number));
    const [a, b] = nested(layout.rows[0]!);
    expect(a![0]).toBe(0);
    expect(b![0]).toBe(a![2]! + 10); // 10 px gap across
    expect(b![0]! + b![2]!).toBe(800); // right edge flush
    expect(a![3]).toBe(b![3]); // same height
    expect(a![2]! / b![2]!).toBeCloseTo(450 / 300, 1); // proportions kept

    const all = nested(layout.combined);
    const rowOneHeight = a![3]!;
    expect(all[2]![1]).toBe(rowOneHeight + 10); // 10 px gap down
    expect(svgHeight(layout.combined)).toBe(rowOneHeight + 10 + all[2]![3]!);
  });

  test("ids are made unique per card", () => {
    const layout = renderLayout([[(e) => renderLanguagesCard(activity, { ...e, layout: "compact" }), (e) => renderLanguagesCard(activity, { ...e, layout: "compact" })]]);
    const ids = [...layout.combined.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
    expect(new Set(ids).size).toBe(ids.length);
    expect(layout.combined).toContain('clip-path="url(#c0-bar)"');
    expect(layout.combined).toContain('clip-path="url(#c1-bar)"');
  });
});
