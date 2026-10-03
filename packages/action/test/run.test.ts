import { describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdtemp, readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { combine, SensitiveNames, svgHeight, type Cache, type CollectOptions, type HostActivity, type ShowcaseItem } from "@git-info-combine/core";
import { commitAndPush } from "../src/git.ts";
import { readConfig } from "../src/inputs.ts";
import { run } from "../src/run.ts";

const host: HostActivity = {
  host: "github",
  login: "octo",
  days: { "2026-10-01": 3 },
  totals: { contributions: 3, commits: 3, pullRequests: 0, issues: 0, reviews: 0, stars: 1, followers: 0, contributedTo: 1 },
  languages: { Swift: { size: 100, weight: 1, repos: 1, color: "#F05138" } },
  repos: { public: 1, private: 0 },
};

function fakeCollect(seen: CollectOptions[]) {
  return async (options: CollectOptions) => {
    seen.push(options);
    const cache: Cache = { version: 1 };
    return { activity: combine([host], new Date("2026-10-02T00:00:00Z")), mirrored: 0, cache, sensitive: new SensitiveNames() };
  };
}

const logger = () => {
  const lines: string[] = [];
  return { lines, info: (m: string) => void lines.push(m), warning: (m: string) => void lines.push(`warning: ${m}`) };
};

describe("run", () => {
  test("writes each built card, light and dark files for auto, and the cache", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "gic-"));
    const log = logger();
    const config = readConfig((name) => ({ "github-token": "a", commit: "false" })[name] ?? "");
    const result = await run(config, { workspace, logger: log, collect: fakeCollect([]) });

    const files = (await readdir(join(workspace, "git-info-combine"))).sort();
    expect(files).toEqual([
      "cache.json",
      "heatmap-dark.svg",
      "heatmap-light.svg",
      "heatmap.svg",
      "languages-dark.svg",
      "languages-light.svg",
      "languages.svg",
      "stats-dark.svg",
      "stats-light.svg",
      "stats.svg",
    ]);
    expect(result.committed).toBe(false);
    expect(log.lines).toContain("Skipping the wakatime card: set wakatime-api-key to show it.");
    expect(log.lines).toContain("Skipping the pins cards: list some in the pins input to show them.");
    expect(await readFile(join(workspace, "git-info-combine/stats-dark.svg"), "utf8")).toContain("--bg:#0d1117");
  });

  test("a named theme writes one file per card", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "gic-"));
    const config = readConfig((name) => ({ "github-token": "a", commit: "false", theme: "radical", cards: "stats" })[name] ?? "");
    await run(config, { workspace, logger: logger(), collect: fakeCollect([]) });
    expect((await readdir(join(workspace, "git-info-combine"))).sort()).toEqual(["cache.json", "stats.svg"]);
  });

  test("passes the last cache and the options to collect", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "gic-"));
    await mkdir(join(workspace, "cards"));
    await writeFile(join(workspace, "cards/cache.json"), JSON.stringify({ version: 1, github: { login: "octo", years: {} } }));
    const seen: CollectOptions[] = [];
    const config = readConfig(
      (name) => ({ "github-token": "a", commit: "false", "output-dir": "cards", "exclude-repos": "x/y" })[name] ?? "",
    );
    await run(config, { workspace, logger: logger(), collect: fakeCollect(seen) });
    expect(seen[0]!.cache).toEqual({ version: 1, github: { login: "octo", years: {} } });
    expect(seen[0]!.excludeRepos).toEqual(["x/y"]);
    expect(seen[0]!.includeOrgRepos).toBe(true);
  });
});

describe("rows", () => {
  const item = (title: string, description: string): ShowcaseItem => ({
    kind: "repo",
    host: "github",
    title,
    path: `octo/${title}`,
    description,
    language: null,
    stars: 0,
    forks: 0,
    archived: false,
  });

  test("cards in a row get the same height, and pins are named after their repo", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "gic-"));
    const config = readConfig(
      (name) =>
        ({ "github-token": "a", commit: "false", theme: "radical", cards: "stats,languages,pins", pins: "octo/short\nOcto/Long.Name" })[name] ?? "",
    );
    await run(config, {
      workspace,
      logger: logger(),
      collect: fakeCollect([]),
      pin: async (ref) => (ref === "octo/short" ? item("short", "Brief") : item("long", "word ".repeat(40))),
    });
    const height = async (file: string) => svgHeight(await readFile(join(workspace, "git-info-combine", file), "utf8"));
    expect(await height("stats.svg")).toBe(await height("languages.svg"));
    expect(await height("pin-github-octo-short.svg")).toBe(await height("pin-github-octo-long-name.svg"));
    expect(await height("pin-github-octo-short.svg")).not.toBe(await height("stats.svg"));
  });

  test("equal-heights can be turned off", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "gic-"));
    const config = readConfig(
      (name) => ({ "github-token": "a", commit: "false", theme: "radical", cards: "stats,languages", "equal-heights": "false" })[name] ?? "",
    );
    await run(config, { workspace, logger: logger(), collect: fakeCollect([]) });
    const height = async (file: string) => svgHeight(await readFile(join(workspace, "git-info-combine", file), "utf8"));
    expect(await height("stats.svg")).not.toBe(await height("languages.svg"));
  });

  test("wakatime is fetched with the key and joins the summary row", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "gic-"));
    const seen: string[] = [];
    const config = readConfig(
      (name) => ({ "github-token": "a", commit: "false", theme: "radical", cards: "stats,wakatime", "wakatime-api-key": "k", "wakatime-range": "last_year" })[name] ?? "",
    );
    await run(config, {
      workspace,
      logger: logger(),
      collect: fakeCollect([]),
      wakatime: async (options) => {
        seen.push(`${options.apiKey}:${options.range}`);
        return { range: "last_year", total: "1 hr", ready: true, languages: [{ name: "Swift", percent: 100, text: "1 hr" }] };
      },
    });
    expect(seen).toEqual(["k:last_year"]);
    const height = async (file: string) => svgHeight(await readFile(join(workspace, "git-info-combine", file), "utf8"));
    expect(await height("wakatime.svg")).toBe(await height("stats.svg"));
  });
});

describe("commitAndPush", () => {
  const git = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();

  test("commits only the output folder, and only when it changed", async () => {
    const repo = await mkdtemp(join(tmpdir(), "gic-git-"));
    git(repo, "init", "--quiet", "-b", "main");
    await writeFile(join(repo, "README.md"), "hi\n");
    git(repo, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "--quiet", "--allow-empty", "-m", "init");
    await mkdir(join(repo, "out"));
    await writeFile(join(repo, "out/stats.svg"), "<svg/>");

    expect(await commitAndPush(repo, "out", "chore: cards", false)).toBe(true);
    expect(git(repo, "log", "-1", "--format=%s|%an")).toBe("chore: cards|github-actions[bot]");
    expect(git(repo, "show", "--name-only", "--format=", "HEAD")).toBe("out/stats.svg");
    expect(git(repo, "status", "--porcelain")).toBe("?? README.md");

    expect(await commitAndPush(repo, "out", "chore: cards", false)).toBe(false);
  });
});
