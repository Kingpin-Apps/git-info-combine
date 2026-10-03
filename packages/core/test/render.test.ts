import { describe, expect, test } from "bun:test";
import { combine } from "../src/combine.ts";
import type { HostActivity } from "../src/model.ts";
import {
  calculateRank,
  escapeXml,
  formatNumber,
  hexColor,
  renderHeatmapCard,
  renderLanguagesCard,
  renderStatsCard,
  resolveScheme,
  topLanguages,
} from "../src/render/index.ts";
import { NOW } from "./fixtures.ts";

const github: HostActivity = {
  host: "github",
  login: "octo<script>",
  days: { "2026-09-28": 2, "2026-10-01": 4, "2025-03-01": 1 },
  totals: { contributions: 7, commits: 1500, pullRequests: 30, issues: 10, reviews: 5, stars: 120, followers: 40, contributedTo: 12 },
  languages: {
    Swift: { size: 6000, weight: 2.5, repos: 3, color: "#F05138" },
    Shell: { size: 1000, weight: 0.5, repos: 1, color: "#89e051" },
  },
  repos: { public: 3, private: 1 },
};

const gitlab: HostActivity = {
  host: "gitlab",
  login: "octo",
  days: { "2026-10-01": 4, "2026-09-30": 1 },
  totals: { contributions: 5, commits: 20, pullRequests: 2, issues: 1, reviews: 0, stars: 3, followers: 0, contributedTo: 4 },
  languages: { Dart: { size: 3000, weight: 2, repos: 2, color: null }, Swift: { size: 0, weight: 0, repos: 0, color: null } },
  repos: { public: 0, private: 2 },
};

const activity = combine([github, gitlab], NOW);

describe("helpers", () => {
  test("formatNumber matches GitHub Stats Extended's short form", () => {
    expect(formatNumber(999)).toBe("999");
    expect(formatNumber(1234)).toBe("1.2k");
    expect(formatNumber(12014)).toBe("12k");
    expect(formatNumber(12014, "long")).toBe("12,014");
  });

  test("escapeXml escapes markup", () => {
    expect(escapeXml(`<a href="x">'&'</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;&apos;&amp;&apos;&lt;/a&gt;");
  });

  test("hexColor accepts hex and rejects anything that could inject CSS", () => {
    expect(hexColor("2f80ed")).toBe("#2f80ed");
    expect(hexColor("#FFF")).toBe("#FFF");
    expect(() => hexColor("red;}svg{display:none")).toThrow("Invalid colour");
  });

  test("auto follows light and dark mode; named themes are fixed", () => {
    const auto = resolveScheme();
    expect(auto.light.bg).toBe("#ffffff");
    expect(auto.dark?.bg).toBe("#0d1117");
    expect(resolveScheme({ theme: "radical" }).dark).toBeUndefined();
    expect(() => resolveScheme({ theme: "nope" })).toThrow('Unknown theme "nope"');
  });

  test("overrides apply in both modes", () => {
    const scheme = resolveScheme({ titleColor: "ff0000" });
    expect(scheme.light.title).toBe("#ff0000");
    expect(scheme.dark?.title).toBe("#ff0000");
  });

  test("gradient themes become a linear gradient", () => {
    const svg = renderLanguagesCard(activity, { theme: "ambient_gradient" });
    expect(svg).toContain("<linearGradient");
    expect(svg).toContain("--bg:url(#bg-gradient)");
  });
});

describe("calculateRank", () => {
  test("matches GitHub Stats Extended's levels", () => {
    expect(calculateRank({ commits: 0, pullRequests: 0, issues: 0, reviews: 0, stars: 0, followers: 0 }).level).toBe("C");
    const strong = calculateRank({ commits: 5000, pullRequests: 500, issues: 200, reviews: 100, stars: 5000, followers: 1000 });
    expect(strong.level).toBe("S");
    expect(strong.percentile).toBeLessThan(1);
  });
});

describe("stats card", () => {
  test("shows combined totals, the rank and the hosts", () => {
    const svg = renderStatsCard(activity);
    expect(svg).toContain("octo&lt;script&gt;&apos;s Git Stats");
    expect(svg).not.toContain("<script>");
    expect(svg).toContain(">1.5k<"); // 1,520 commits across hosts
    expect(svg).toContain(">123<"); // stars
    expect(svg).toContain(">GitHub<");
    expect(svg).toContain(">GitLab<");
    expect(svg).toContain('width="450"');
  });

  test("rows and the rank can be hidden", () => {
    const svg = renderStatsCard(activity, { hide: ["stars", "reviews"], hideRank: true, showHosts: false, name: "Hareem" });
    expect(svg).toContain("Hareem&apos;s Git Stats");
    expect(svg).not.toContain("Total Stars Earned");
    expect(svg).not.toContain("Total Reviews");
    expect(svg).not.toContain("<circle r=");
    expect(svg).not.toContain(">GitLab<");
    expect(svg).toContain('width="300"');
  });
});

describe("languages card", () => {
  test("by default every repo counts once, across both hosts", () => {
    expect(topLanguages(activity, 5)).toEqual([
      { name: "Swift", color: "#F05138", percent: 50 },
      { name: "Dart", color: "#00B4AB", percent: 40 }, // GitLab gives no colour; Linguist's is used
      { name: "Shell", color: "#89e051", percent: 10 },
    ]);
    expect(topLanguages(activity, 1).map((l) => l.percent)).toEqual([100]);
    expect(topLanguages(activity, 5, ["swift"]).map((l) => l.name)).toEqual(["Dart", "Shell"]);
  });

  test("size weighting uses bytes instead", () => {
    expect(topLanguages(activity, 5, [], "size").map((l) => [l.name, l.percent])).toEqual([
      ["Swift", 60],
      ["Dart", 30],
      ["Shell", 10],
    ]);
  });

  test("renders both layouts", () => {
    expect(renderLanguagesCard(activity)).toContain("50.00%");
    expect(renderLanguagesCard(activity, { weighting: "size" })).toContain("60.00%");
    const compact = renderLanguagesCard(activity, { layout: "compact" });
    expect(compact).toContain('clip-path="url(#bar)"');
    expect(compact).toContain("Swift 50.00%");
  });

  test("says so when there are no languages", () => {
    expect(renderLanguagesCard(activity, { hide: ["Swift", "Dart", "Shell"] })).toContain("No languages found.");
  });
});

describe("heatmap card", () => {
  test("last year covers 365 days and counts contributions in range", () => {
    const svg = renderHeatmapCard(activity);
    expect(svg).toContain("11 contributions in the last year"); // 2025-03-01 is out of range
    const empty = svg.match(/<path d="([^"]*)"/)![1]!.split("z").filter(Boolean).length;
    const filled = 3; // 2026-09-28, 2026-09-30, 2026-10-01
    expect(empty + filled).toBe(365);
  });

  test("splits a day shared by both hosts by colour", () => {
    const svg = renderHeatmapCard(activity);
    // 2026-10-01 has 4 on each host: two stacked halves.
    expect(svg).toMatch(/<g fill-opacity="[\d.]+"><rect [^>]*height="5\.0" fill="#40c463"\/><rect [^>]*height="5\.0" fill="#fc6d26"\/><\/g>/);
  });

  test("single mode uses the theme colour", () => {
    const svg = renderHeatmapCard(activity, { mode: "single" });
    expect(svg).not.toContain("#fc6d26");
    expect(svg).toContain('fill="var(--icon)"');
  });

  test("all shows every year, newest first", () => {
    const svg = renderHeatmapCard(activity, { range: "all" });
    expect(svg).toContain("12 contributions since 2025");
    expect(svg.indexOf(">2026<")).toBeLessThan(svg.indexOf(">2025<"));
  });

  test("custom host colours are validated", () => {
    expect(renderHeatmapCard(activity, { hostColors: { gitlab: "#6e49cb" } })).toContain("#6e49cb");
    expect(() => renderHeatmapCard(activity, { hostColors: { gitlab: "orange" } })).toThrow("Invalid GitLab colour");
  });
});

describe("snapshots", () => {
  test.each([
    ["stats", () => renderStatsCard(activity)],
    ["languages", () => renderLanguagesCard(activity)],
    ["languages compact", () => renderLanguagesCard(activity, { layout: "compact", theme: "radical" })],
    ["heatmap", () => renderHeatmapCard(activity)],
  ])("%s", (_, render) => {
    expect(render()).toMatchSnapshot();
  });
});
