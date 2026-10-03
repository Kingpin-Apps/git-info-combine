import { describe, expect, test } from "bun:test";
import { fetchGitLab } from "../src/gitlab.ts";
import { opaqueId } from "../src/privacy.ts";
import { GITLAB_EVENTS, gitlabRoute, NOW, PRIVATE_NAMES } from "./fixtures.ts";
import { mockFetch } from "./mock.ts";

describe("fetchGitLab", () => {
  test("counts events the way GitLab's calendar does", async () => {
    const { fetch } = mockFetch(gitlabRoute());
    const { activity } = await fetchGitLab({ token: "t", fetch, now: NOW });

    // The "joined" event is not a contribution.
    expect(activity.days).toEqual({ "2026-09-30": 3, "2026-10-01": 1, "2026-10-02": 3 });
    expect(activity.totals).toEqual({
      contributions: 7,
      commits: 3, // the tag push adds none
      pullRequests: 1,
      issues: 1,
      reviews: 2, // an approval and a merge request comment; the issue comment is not a review
      stars: 5, // the fork's 100 stars belong upstream
      followers: 2,
      contributedTo: 2, // the joined project is not a contribution
    });
    expect(activity.repos).toEqual({ public: 1, private: 1 });
  });

  test("weights language percentages by repository size and skips forks", async () => {
    const { fetch, calls } = mockFetch(gitlabRoute());
    const { activity } = await fetchGitLab({ token: "t", fetch, now: NOW });
    expect(activity.languages).toEqual({
      TypeScript: { size: 7500, repos: 1, color: null },
      CSS: { size: 2500, repos: 1, color: null },
      Python: { size: 2000, repos: 1, color: null },
    });
    expect(calls.some((call) => call.url.pathname.endsWith("/projects/3/languages"))).toBe(false);
  });

  test("follows pagination", async () => {
    const { fetch, calls } = mockFetch(gitlabRoute("https://gitlab.com", GITLAB_EVENTS, 2));
    const { activity } = await fetchGitLab({ token: "t", fetch, now: NOW });
    expect(calls.filter((call) => call.url.pathname === "/api/v4/events")).toHaveLength(4);
    expect(activity.totals.contributions).toBe(7);
  });

  test("next run fetches only from the last fetched day and keeps older days", async () => {
    const first = await fetchGitLab({ token: "t", fetch: mockFetch(gitlabRoute()).fetch, now: new Date("2026-10-01T23:00:00Z") });
    expect(first.cache.fetchedThrough).toBe("2026-10-01");

    // GitLab has since deleted the oldest event; the cache must keep it.
    const later = GITLAB_EVENTS.slice(1);
    const { fetch, calls } = mockFetch(gitlabRoute("https://gitlab.com", later));
    const second = await fetchGitLab({ token: "t", fetch, now: NOW, cache: first.cache });

    const events = calls.find((call) => call.url.pathname === "/api/v4/events")!;
    expect(events.url.searchParams.get("after")).toBe("2026-09-30");
    expect(second.activity.days).toEqual({ "2026-09-30": 3, "2026-10-01": 1, "2026-10-02": 3 });
    expect(second.activity.totals.commits).toBe(3);
  });

  test("a cache from another instance or user starts fresh", async () => {
    const first = await fetchGitLab({ token: "t", fetch: mockFetch(gitlabRoute()).fetch, now: NOW });
    const { fetch, calls } = mockFetch(gitlabRoute());
    await fetchGitLab({ token: "t", fetch, now: NOW, cache: { ...first.cache, userId: 7 } });
    const events = calls.find((call) => call.url.pathname === "/api/v4/events")!;
    expect(events.url.searchParams.get("after")).toBeNull();
  });

  test("self-hosted: uses the instance URL and never outputs its hostname", async () => {
    const baseUrl = "https://git.secretcorp.internal/";
    const { fetch, calls } = mockFetch(gitlabRoute("https://git.secretcorp.internal"));
    const { activity, cache, sensitive } = await fetchGitLab({ token: "t", baseUrl, fetch, now: NOW });

    expect(calls.every((call) => call.url.hostname === "git.secretcorp.internal")).toBe(true);
    expect(cache.instance).toBe(opaqueId("gitlab-instance", "https://git.secretcorp.internal"));
    const output = JSON.stringify({ activity, cache }).toLowerCase();
    for (const name of PRIVATE_NAMES) expect(output).not.toContain(name.toLowerCase());
    expect(() => sensitive.assertAbsent({ activity, cache }, "output")).not.toThrow();
    expect(() => sensitive.assertAbsent({ note: "git.secretcorp.internal" }, "output")).toThrow();
  });

  test("sends the token as a bearer token, which suits personal and OAuth tokens", async () => {
    const { fetch, calls } = mockFetch(gitlabRoute());
    await fetchGitLab({ token: "secret-token", fetch, now: NOW });
    expect(calls.every((call) => call.headers.get("authorization") === "Bearer secret-token")).toBe(true);
  });
});
