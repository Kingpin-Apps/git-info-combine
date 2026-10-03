import { describe, expect, test } from "bun:test";
import { fetchGitLab } from "../src/gitlab.ts";
import { opaqueId } from "../src/privacy.ts";
import { GITLAB_EVENTS, gitlabRoute, NOW, PRIVATE_NAMES } from "./fixtures.ts";
import { mockFetch } from "./mock.ts";

const path = (call: { url: URL }) => call.url.pathname.replace(/^\/api\/v4/, "");

describe("fetchGitLab", () => {
  test("counts events the way GitLab's calendar does, and commits from contributors", async () => {
    const { fetch } = mockFetch(gitlabRoute());
    const { activity, mirrored } = await fetchGitLab({ token: "t", fetch, now: NOW });

    // The "joined" event is not a contribution.
    expect(activity.days).toEqual({ "2026-09-30": 3, "2026-10-01": 1, "2026-10-02": 3 });
    expect(activity.totals).toEqual({
      contributions: 7,
      // The user's commits on default branches, matched by any of their emails or their name:
      // 12 in project 1 (not the other contributor's 50), 5 in project 2, 7 in the WordPress site.
      commits: 24,
      pullRequests: 1,
      issues: 1,
      reviews: 2, // an approval and a merge request comment; the issue comment is not a review
      stars: 7, // the fork's 100 stars belong upstream
      followers: 2,
      contributedTo: 2, // the joined project is not a contribution
    });
    expect(activity.repos).toEqual({ public: 1, private: 2 });
    expect(mirrored).toBe(0);
  });

  test("languages count each project once, and a WordPress site as one PHP project", async () => {
    const { fetch } = mockFetch(gitlabRoute());
    const { activity } = await fetchGitLab({ token: "t", fetch, now: NOW });
    expect(activity.languages).toEqual({
      TypeScript: { size: 7500, weight: 0.75, repos: 1, color: null },
      CSS: { size: 2500, weight: 0.25, repos: 1, color: null },
      Python: { size: 2000, weight: 1, repos: 1, color: null },
      // 500 MB of WordPress core is not counted as the user's code.
      PHP: { size: 0, weight: 1, repos: 1, color: null },
    });
  });

  test("WordPress detection can be turned off", async () => {
    const { fetch } = mockFetch(gitlabRoute());
    const { activity } = await fetchGitLab({ token: "t", fetch, now: NOW, detectWordPress: false });
    expect(activity.languages.PHP).toEqual({ size: 350_000_000, weight: 0.7, repos: 1, color: null });
    expect(activity.languages.JavaScript?.weight).toBe(0.2);
  });

  test("a project whose latest commit matches a GitHub repo is a mirror and counts once", async () => {
    const { fetch } = mockFetch(gitlabRoute());
    const { activity, mirrored } = await fetchGitLab({
      token: "t",
      fetch,
      now: NOW,
      githubHeads: new Set([opaqueId("commit", "aaa111")]),
    });
    expect(mirrored).toBe(1);
    // Project 1's commits, stars, languages and pushes already count on GitHub.
    expect(activity.totals.commits).toBe(12);
    expect(activity.totals.stars).toBe(6);
    expect(activity.languages.TypeScript).toBeUndefined();
    expect(activity.repos).toEqual({ public: 1, private: 1 });
    expect(activity.days).toEqual({ "2026-09-30": 1, "2026-10-01": 1, "2026-10-02": 3 });
    expect(activity.totals.contributions).toBe(5);
  });

  test("mirrors can be named by hand", async () => {
    const { fetch } = mockFetch(gitlabRoute());
    const { mirrored, activity } = await fetchGitLab({ token: "t", fetch, now: NOW, mirrors: ["Acme-Corp/Client-Portal-X"] });
    expect(mirrored).toBe(1);
    expect(activity.totals.commits).toBe(12);
  });

  test("project stats are reused until the project changes", async () => {
    const first = await fetchGitLab({ token: "t", fetch: mockFetch(gitlabRoute()).fetch, now: NOW });
    const { fetch, calls } = mockFetch(gitlabRoute());
    const second = await fetchGitLab({ token: "t", fetch, now: NOW, cache: first.cache });
    expect(calls.filter((call) => path(call).includes("/repository/"))).toHaveLength(0);
    expect(calls.filter((call) => path(call).endsWith("/languages"))).toHaveLength(0);
    expect(second.activity).toEqual(first.activity);

    const stale = structuredClone(first.cache);
    stale.projectStats![opaqueId("gitlab", 2)]!.activity = "2020-01-01T00:00:00Z";
    const third = mockFetch(gitlabRoute());
    await fetchGitLab({ token: "t", fetch: third.fetch, now: NOW, cache: stale });
    expect(third.calls.filter((call) => path(call).includes("/repository/contributors")).map(path)).toEqual([
      "/projects/2/repository/contributors",
    ]);
  });

  test("next run fetches only from the last fetched day and keeps older days", async () => {
    const first = await fetchGitLab({ token: "t", fetch: mockFetch(gitlabRoute()).fetch, now: new Date("2026-10-01T23:00:00Z") });
    expect(first.cache.fetchedThrough).toBe("2026-10-01");

    // GitLab has since deleted the oldest event; the cache must keep it.
    const later = GITLAB_EVENTS.slice(1);
    const { fetch, calls } = mockFetch(gitlabRoute("https://gitlab.com", later));
    const second = await fetchGitLab({ token: "t", fetch, now: NOW, cache: first.cache });

    const events = calls.find((call) => path(call) === "/events")!;
    expect(events.url.searchParams.get("after")).toBe("2026-09-30");
    expect(second.activity.days).toEqual({ "2026-09-30": 3, "2026-10-01": 1, "2026-10-02": 3 });
  });

  test("a change in mirrors counts every event again", async () => {
    const first = await fetchGitLab({ token: "t", fetch: mockFetch(gitlabRoute()).fetch, now: NOW });
    const { fetch, calls } = mockFetch(gitlabRoute());
    const second = await fetchGitLab({ token: "t", fetch, now: NOW, cache: first.cache, mirrors: ["acme-corp/client-portal-x"] });
    expect(calls.find((call) => path(call) === "/events")!.url.searchParams.get("after")).toBeNull();
    expect(second.activity.totals.contributions).toBe(5);
  });

  test("a cache from another instance or user starts fresh", async () => {
    const first = await fetchGitLab({ token: "t", fetch: mockFetch(gitlabRoute()).fetch, now: NOW });
    const { fetch, calls } = mockFetch(gitlabRoute());
    await fetchGitLab({ token: "t", fetch, now: NOW, cache: { ...first.cache, userId: 7 } });
    expect(calls.find((call) => path(call) === "/events")!.url.searchParams.get("after")).toBeNull();
    expect(calls.some((call) => path(call).includes("/repository/contributors"))).toBe(true);
  });

  test("follows pagination", async () => {
    const { fetch, calls } = mockFetch(gitlabRoute("https://gitlab.com", GITLAB_EVENTS, 2));
    const { activity } = await fetchGitLab({ token: "t", fetch, now: NOW });
    expect(calls.filter((call) => path(call) === "/events")).toHaveLength(4);
    expect(activity.totals.contributions).toBe(7);
  });

  test("self-hosted: uses the instance URL and never outputs its hostname or private names", async () => {
    const baseUrl = "https://git.secretcorp.internal/";
    const { fetch, calls } = mockFetch(gitlabRoute("https://git.secretcorp.internal"));
    const { activity, cache, sensitive } = await fetchGitLab({ token: "t", baseUrl, fetch, now: NOW });

    expect(calls.every((call) => call.url.hostname === "git.secretcorp.internal")).toBe(true);
    expect(cache.instance).toBe(opaqueId("gitlab-instance", "https://git.secretcorp.internal"));
    const output = JSON.stringify({ activity, cache }).toLowerCase();
    for (const name of PRIVATE_NAMES) expect(output).not.toContain(name.toLowerCase());
    expect(output).not.toContain("octo@example.com");
    expect(output).not.toContain("aaa111");
    expect(() => sensitive.assertAbsent({ activity, cache }, "output")).not.toThrow();
    expect(() => sensitive.assertAbsent({ note: "git.secretcorp.internal" }, "output")).toThrow();
  });

  test("sends the token as a bearer token, which suits personal and OAuth tokens", async () => {
    const { fetch, calls } = mockFetch(gitlabRoute());
    await fetchGitLab({ token: "secret-token", fetch, now: NOW });
    expect(calls.every((call) => call.headers.get("authorization") === "Bearer secret-token")).toBe(true);
  });
});
