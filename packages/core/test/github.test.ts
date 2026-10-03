import { describe, expect, test } from "bun:test";
import { fetchGitHub } from "../src/github.ts";
import { githubRoute, NOW, PRIVATE_NAMES } from "./fixtures.ts";
import { json, mockFetch, noSleep } from "./mock.ts";
import { opaqueId } from "../src/privacy.ts";

describe("fetchGitHub", () => {
  test("adds up every year since the account was created", async () => {
    const { fetch } = mockFetch(githubRoute);
    const { activity, cache } = await fetchGitHub({ token: "t", fetch, now: NOW });

    expect(activity.login).toBe("octo");
    expect(activity.days).toEqual({ "2025-06-02": 7, "2025-12-31": 9, "2026-01-05": 3, "2026-10-01": 4 });
    expect(activity.totals).toEqual({
      contributions: 23,
      commits: 14,
      pullRequests: 4,
      issues: 2,
      reviews: 3,
      stars: 3,
      followers: 12,
      contributedTo: 5,
    });
    expect(activity.repos).toEqual({ public: 1, private: 1 });
    expect(activity.languages).toEqual({
      Swift: { size: 5500, weight: 1 + 1 / 3, repos: 2, color: "#F05138" },
      Shell: { size: 1000, weight: 2 / 3, repos: 1, color: "#89e051" },
    });
    expect(cache.years["2025"]!.complete).toBe(true);
    expect(cache.years["2026"]!.complete).toBe(false);
  });

  test("first year starts at account creation; current year ends now", async () => {
    const { fetch, calls } = mockFetch(githubRoute);
    await fetchGitHub({ token: "t", fetch, now: NOW });
    const ranges = calls
      .filter((call) => call.body.query.includes("contributionsCollection"))
      .map((call) => call.body.variables);
    expect(ranges).toEqual([
      { from: "2025-03-15T08:00:00Z", to: "2025-12-31T23:59:59.000Z" },
      { from: "2026-01-01T00:00:00Z", to: NOW.toISOString() },
    ]);
  });

  test("includes org repos by default and can be limited to owned repos", async () => {
    const repoAffiliations = async (includeOrgRepos?: boolean) => {
      const { fetch, calls } = mockFetch(githubRoute);
      await fetchGitHub({ token: "t", fetch, now: NOW, includeOrgRepos });
      return calls.filter((call) => call.body.query.includes("repositories(")).map((call) => call.body.variables.affiliations);
    };
    expect(await repoAffiliations()).toEqual([
      ["OWNER", "ORGANIZATION_MEMBER"],
      ["OWNER", "ORGANIZATION_MEMBER"],
    ]);
    expect(await repoAffiliations(false)).toEqual([["OWNER"], ["OWNER"]]);
  });

  test("returns hashed default-branch heads for spotting mirrors", async () => {
    const { heads } = await fetchGitHub({ token: "t", fetch: mockFetch(githubRoute).fetch, now: NOW });
    expect([...heads].sort()).toEqual([opaqueId("commit", "eee555"), opaqueId("commit", "ccc333")].sort());
  });

  test("a repo that bundles WordPress core counts as one PHP repo", async () => {
    const route = mockFetch((call) => {
      const response = githubRoute(call);
      if (!call.body.query.includes("repositories(")) return response;
      return json({
        data: {
          viewer: {
            repositories: {
              pageInfo: { hasNextPage: false, endCursor: null },
              nodes: [
                {
                  name: "site",
                  nameWithOwner: "octo/site",
                  isPrivate: false,
                  stargazerCount: 0,
                  defaultBranchRef: null,
                  wordpress: { id: "x" },
                  languages: { edges: [{ size: 9_000_000, node: { name: "PHP", color: "#4F5D95" } }, { size: 3_000_000, node: { name: "JavaScript", color: "#f1e05a" } }] },
                },
              ],
            },
          },
        },
      });
    });
    const { activity } = await fetchGitHub({ token: "t", fetch: route.fetch, now: NOW });
    expect(activity.languages).toEqual({ PHP: { size: 0, weight: 1, repos: 1, color: null } });
  });

  test("reuses complete years from the cache", async () => {
    const first = await fetchGitHub({ token: "t", fetch: mockFetch(githubRoute).fetch, now: NOW });
    const { fetch, calls } = mockFetch(githubRoute);
    const second = await fetchGitHub({ token: "t", fetch, now: NOW, cache: first.cache });

    const years = calls.filter((call) => call.body.query.includes("contributionsCollection"));
    expect(years.map((call) => call.body.variables.from.slice(0, 4))).toEqual(["2026"]);
    expect(second.activity).toEqual(first.activity);
  });

  test("ignores a cache that belongs to another login", async () => {
    const first = await fetchGitHub({ token: "t", fetch: mockFetch(githubRoute).fetch, now: NOW });
    const { fetch, calls } = mockFetch(githubRoute);
    await fetchGitHub({ token: "t", fetch, now: NOW, cache: { ...first.cache, login: "someone-else" } });
    expect(calls.filter((call) => call.body.query.includes("contributionsCollection"))).toHaveLength(2);
  });

  test("records private repo names as sensitive and never outputs them", async () => {
    const { activity, cache, sensitive } = await fetchGitHub({ token: "t", fetch: mockFetch(githubRoute).fetch, now: NOW });
    const output = JSON.stringify({ activity, cache }).toLowerCase();
    for (const name of PRIVATE_NAMES) expect(output).not.toContain(name.toLowerCase());
    expect(sensitive.size).toBe(2);
    expect(() => sensitive.assertAbsent({ activity, cache }, "output")).not.toThrow();
  });

  test("GraphQL errors are reported without their messages", async () => {
    const { fetch } = mockFetch(() =>
      json({ errors: [{ type: "NOT_FOUND", message: "Could not resolve octo/topsecret-banking-core" }] }),
    );
    const error = await fetchGitHub({ token: "t", fetch, now: NOW, sleep: noSleep }).catch((e: Error) => e);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe("GitHub GraphQL request failed: NOT_FOUND");
  });

  test("sends the token as a bearer token", async () => {
    const { fetch, calls } = mockFetch(githubRoute);
    await fetchGitHub({ token: "secret-token", fetch, now: NOW });
    expect(calls[0]!.headers.get("authorization")).toBe("bearer secret-token");
  });
});
