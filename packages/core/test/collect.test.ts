import { describe, expect, test } from "bun:test";
import { collect, parseCache } from "../src/collect.ts";
import { githubRoute, gitlabRoute, NOW, PRIVATE_NAMES } from "./fixtures.ts";
import { mockFetch } from "./mock.ts";

const route = (base?: string) => {
  const gitlab = gitlabRoute(base);
  return mockFetch((call) => githubRoute(call) ?? gitlab(call)).fetch;
};

describe("collect", () => {
  test("combines both hosts", async () => {
    const { activity } = await collect({ githubToken: "a", gitlabToken: "b", fetch: route(), now: NOW });
    expect(activity.hosts.map((host) => host.host)).toEqual(["github", "gitlab"]);
    expect(activity.totals.contributions).toBe(30);
    expect(activity.totals.stars).toBe(10);
    expect(activity.days["2026-10-01"]).toBe(5);
    expect(Object.keys(activity.days)).toEqual([...Object.keys(activity.days)].sort());
    expect(activity.languages.Swift).toEqual({ size: 5500, weight: 1 + 1 / 3, repos: 2, color: "#F05138" });
    expect(activity.generatedAt).toBe(NOW.toISOString());
  });

  test("no private name reaches the activity data or the cache", async () => {
    const result = await collect({
      githubToken: "a",
      gitlabToken: "b",
      gitlabUrl: "https://git.secretcorp.internal",
      fetch: route("https://git.secretcorp.internal"),
      now: NOW,
    });
    const output = JSON.stringify({ activity: result.activity, cache: result.cache }).toLowerCase();
    for (const name of PRIVATE_NAMES) expect(output).not.toContain(name.toLowerCase());
    // GitHub: name and owner/name. GitLab, for each of two private projects: name (same as
    // its path) and both full paths. Plus the hostname.
    expect(result.sensitive.size).toBe(9);
  });

  test("named GitLab mirrors are counted once and reported", async () => {
    const result = await collect({
      githubToken: "a",
      gitlabToken: "b",
      gitlabMirrors: ["acme-corp/client-portal-x"],
      fetch: route(),
      now: NOW,
    });
    expect(result.mirrored).toBe(1);
    expect(result.activity.hosts[1]!.totals.commits).toBe(16);
  });

  test("the cache round-trips", async () => {
    const first = await collect({ githubToken: "a", gitlabToken: "b", fetch: route(), now: NOW });
    const cache = parseCache(JSON.stringify(first.cache));
    expect(cache).toEqual(first.cache);
    const second = await collect({ githubToken: "a", gitlabToken: "b", fetch: route(), now: NOW, cache });
    expect(second.activity).toEqual(first.activity);
  });

  test("excluded repos and projects leave languages and stars", async () => {
    const { activity } = await collect({
      githubToken: "a",
      gitlabToken: "b",
      fetch: route(),
      now: NOW,
      excludeRepos: ["octo/dotfiles", "OPEN-WIDGET"],
    });
    expect(activity.totals.stars).toBe(3);
    expect(Object.keys(activity.languages).sort()).toEqual(["CSS", "PHP", "Swift", "TypeScript"]);
  });

  test("needs at least one token", async () => {
    await expect(collect({ fetch: route(), now: NOW })).rejects.toThrow("Set at least one of github-token and gitlab-token.");
  });
});

describe("parseCache", () => {
  test("starts fresh on missing, broken or old caches", () => {
    expect(parseCache(undefined)).toBeUndefined();
    expect(parseCache("{not json")).toBeUndefined();
    expect(parseCache(JSON.stringify({ version: 0 }))).toBeUndefined();
  });
});
