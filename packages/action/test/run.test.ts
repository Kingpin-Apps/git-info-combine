import { describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdtemp, readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { combine, SensitiveNames, type Cache, type CollectOptions, type HostActivity } from "@git-info-combine/core";
import { commitAndPush } from "../src/git.ts";
import { readConfig } from "../src/inputs.ts";
import { run } from "../src/run.ts";

const host: HostActivity = {
  host: "github",
  login: "octo",
  days: { "2026-10-01": 3 },
  totals: { contributions: 3, commits: 3, pullRequests: 0, issues: 0, reviews: 0, stars: 1, followers: 0, contributedTo: 1 },
  languages: { Swift: { size: 100, repos: 1, color: "#F05138" } },
  repos: { public: 1, private: 0 },
};

function fakeCollect(seen: CollectOptions[]) {
  return async (options: CollectOptions) => {
    seen.push(options);
    const cache: Cache = { version: 1 };
    return { activity: combine([host], new Date("2026-10-02T00:00:00Z")), cache, sensitive: new SensitiveNames() };
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
    expect(log.lines).toContain("warning: The wakatime card is not available yet; skipping it.");
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
