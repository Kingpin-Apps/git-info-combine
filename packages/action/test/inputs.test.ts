import { describe, expect, test } from "bun:test";
import { readConfig } from "../src/inputs.ts";

const inputs = (values: Record<string, string>) => (name: string) => values[name] ?? "";

describe("readConfig", () => {
  test("defaults", () => {
    const config = readConfig(inputs({ "github-token": "a" }));
    expect(config.cards).toEqual(["heatmap", "stats", "languages", "hosts", "wakatime", "pins", "gists"]);
    expect(config.layout).toEqual([]);
    expect(config.layoutWidth).toBe(800);
    expect(config.layoutGap).toBe(10);
    expect(config.outputDir).toBe("git-info-combine");
    expect(config.commit).toBe(true);
    expect(config.includeOrgRepos).toBe(true);
    expect(config.excludeRepos).toEqual([]);
    expect(config.stats.showHosts).toBe(true);
    expect(config.stats.hideRank).toBe(false);
    expect(config.heatmap.theme).toBeUndefined();
  });

  test("reads card options", () => {
    const config = readConfig(
      inputs({
        "gitlab-token": "b",
        "gitlab-url": "https://git.example.com",
        cards: "heatmap, stats",
        theme: "radical",
        "stats-hide": "stars,\nreviews",
        "hide-rank": "true",
        "languages-layout": "compact",
        "languages-count": "8",
        "languages-hide": "Untyped Plutus Core, HTML",
        "heatmap-range": "all",
        "heatmap-mode": "single",
        "gitlab-color": "#6e49cb",
        "include-org-repos": "false",
        "exclude-repos": "octo/dotfiles",
        commit: "no",
      }),
    );
    expect(config.cards).toEqual(["heatmap", "stats"]);
    expect(config.gitlabUrl).toBe("https://git.example.com");
    expect(config.stats).toMatchObject({ theme: "radical", hide: ["stars", "reviews"], hideRank: true });
    expect(config.languages).toMatchObject({ layout: "compact", count: 8, hide: ["Untyped Plutus Core", "HTML"] });
    expect(config.heatmap).toMatchObject({ range: "all", mode: "single", hostColors: { gitlab: "#6e49cb" } });
    expect(config.includeOrgRepos).toBe(false);
    expect(config.excludeRepos).toEqual(["octo/dotfiles"]);
    expect(config.commit).toBe(false);
  });

  test("reads the layout, one row per line", () => {
    const config = readConfig(inputs({ "github-token": "a", layout: "heatmap\n\n stats, languages \nWakaTime hosts\npins", "layout-width": "760" }));
    expect(config.layout).toEqual([["heatmap"], ["stats", "languages"], ["wakatime", "hosts"], ["pins"]]);
    expect(config.layoutWidth).toBe(760);
    expect(() => readConfig(inputs({ "github-token": "a", layout: "heatmap streak" }))).toThrow('unknown card "streak"');
  });

  test("rejects bad values with a clear message", () => {
    expect(() => readConfig(inputs({}))).toThrow("Set at least one of github-token and gitlab-token.");
    expect(() => readConfig(inputs({ "github-token": "a", "hide-rank": "maybe" }))).toThrow("Input hide-rank must be true or false");
    expect(() => readConfig(inputs({ "github-token": "a", "heatmap-range": "week" }))).toThrow("Input heatmap-range must be one of last-year, all");
    expect(() => readConfig(inputs({ "github-token": "a", "stats-hide": "followers" }))).toThrow('unknown stat "followers"');
    expect(() => readConfig(inputs({ "github-token": "a", "languages-count": "-1" }))).toThrow("positive number");
  });
});
