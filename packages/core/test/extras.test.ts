import { describe, expect, test } from "bun:test";
import { fetchGist, fetchPin, parseRef } from "../src/showcase.ts";
import { fetchWakaTime } from "../src/wakatime.ts";
import { renderShowcaseCard, renderWakaTimeCard, svgHeight, wrapText } from "../src/render/index.ts";
import { json, mockFetch } from "./mock.ts";

describe("parseRef", () => {
  test("defaults to GitHub and reads host prefixes", () => {
    expect(parseRef("octo/app")).toEqual({ host: "github", path: "octo/app" });
    expect(parseRef("GitLab:group/sub/project/")).toEqual({ host: "gitlab", path: "group/sub/project" });
    expect(parseRef("github:abc123")).toEqual({ host: "github", path: "abc123" });
    expect(() => parseRef("gitlab:")).toThrow();
  });
});

describe("fetchWakaTime", () => {
  test("keeps languages only and sends the key as basic auth", async () => {
    const { fetch, calls } = mockFetch(() =>
      json({
        data: {
          status: "ok",
          human_readable_total: "12 hrs 5 mins",
          languages: [{ name: "Swift", percent: 70.5, text: "8 hrs 30 mins", total_seconds: 1 }],
          projects: [{ name: "topsecret-client" }],
        },
      }),
    );
    const stats = await fetchWakaTime({ apiKey: "waka_key", fetch, range: "last_30_days" });
    expect(calls[0]!.url.href).toBe("https://wakatime.com/api/v1/users/current/stats/last_30_days");
    expect(calls[0]!.headers.get("authorization")).toBe(`Basic ${btoa("waka_key")}`);
    expect(stats).toEqual({
      range: "last_30_days",
      total: "12 hrs 5 mins",
      ready: true,
      languages: [{ name: "Swift", percent: 70.5, text: "8 hrs 30 mins" }],
    });
    expect(JSON.stringify(stats)).not.toContain("topsecret");
  });

  test("works with a compatible server such as Wakapi", async () => {
    const { fetch, calls } = mockFetch(() => json({ data: { status: "pending_update" } }));
    const stats = await fetchWakaTime({ apiKey: "k", apiUrl: "https://wakapi.example.com/api/compat/wakatime/v1/", fetch });
    expect(calls[0]!.url.pathname).toBe("/api/compat/wakatime/v1/users/current/stats/last_7_days");
    expect(stats.ready).toBe(false);
  });
});

describe("fetchPin", () => {
  const github = (repository: unknown) => mockFetch(() => json({ data: { repository } })).fetch;
  const repo = {
    name: "app",
    nameWithOwner: "octo/app",
    description: "An app",
    isPrivate: false,
    isArchived: false,
    stargazerCount: 1200,
    forkCount: 3,
    primaryLanguage: { name: "Swift", color: "#F05138" },
  };

  test("reads a public GitHub repo", async () => {
    const item = await fetchPin("octo/app", { githubToken: "t", fetch: github(repo) });
    expect(item).toMatchObject({ kind: "repo", host: "github", title: "app", stars: 1200, language: { name: "Swift" } });
  });

  test("refuses private or missing repos", async () => {
    await expect(fetchPin("octo/app", { githubToken: "t", fetch: github({ ...repo, isPrivate: true }) })).rejects.toThrow("Only public repos");
    await expect(fetchPin("octo/app", { githubToken: "t", fetch: github(null) })).rejects.toThrow("Only public repos");
    await expect(fetchPin("octo", { githubToken: "t", fetch: github(repo) })).rejects.toThrow("owner/repo");
  });

  test("reads a public GitLab project, including self-hosted, and refuses private ones", async () => {
    const route = (visibility: string) =>
      mockFetch((call) => {
        if (call.url.pathname === "/api/v4/projects/group%2Fsub%2Ftool") {
          return json({ id: 7, name: "tool", path_with_namespace: "group/sub/tool", description: "", visibility, archived: true, star_count: 5, forks_count: 1 });
        }
        if (call.url.pathname === "/api/v4/projects/7/languages") return json({ Go: 80, Shell: 20 });
        return undefined;
      }).fetch;
    const item = await fetchPin("gitlab:group/sub/tool", { gitlabToken: "t", gitlabUrl: "https://git.example.com", fetch: route("public") });
    expect(item).toMatchObject({ host: "gitlab", title: "tool", description: null, language: { name: "Go" }, archived: true });
    await expect(fetchPin("gitlab:group/sub/tool", { gitlabToken: "t", fetch: route("internal") })).rejects.toThrow("Only public projects");
  });

  test("needs the host's token", async () => {
    await expect(fetchPin("gitlab:a/b", { githubToken: "t" })).rejects.toThrow("gitlab-token is needed");
  });
});

describe("fetchGist", () => {
  test("reads a public gist and refuses secret ones", async () => {
    const gist = (isPublic: boolean) =>
      mockFetch(() =>
        json({
          data: {
            viewer: {
              gist: {
                name: "abc",
                description: "Handy",
                isPublic,
                stargazerCount: 2,
                forks: { totalCount: 1 },
                files: [{ name: "x.swift", language: { name: "Swift", color: "#F05138" } }],
              },
            },
          },
        }),
      ).fetch;
    expect(await fetchGist("abc", { githubToken: "t", fetch: gist(true) })).toMatchObject({ kind: "gist", title: "x.swift", stars: 2 });
    await expect(fetchGist("abc", { githubToken: "t", fetch: gist(false) })).rejects.toThrow("Only public gists");
  });

  test("reads a public GitLab snippet", async () => {
    const { fetch } = mockFetch(() => json({ id: 9, title: "Deploy notes", description: null, visibility: "public" }));
    expect(await fetchGist("gitlab:9", { gitlabToken: "t", fetch })).toMatchObject({ host: "gitlab", title: "Deploy notes", path: "9" });
  });
});

describe("cards", () => {
  test("wrapText wraps and cuts with an ellipsis", () => {
    expect(wrapText("one two three four", 9, 3)).toEqual(["one two", "three", "four"]);
    expect(wrapText("one two three four five six", 9, 2)).toEqual(["one two", "three…"]);
  });

  test("showcase card shows title, stars, language and host", () => {
    const svg = renderShowcaseCard({
      kind: "repo",
      host: "github",
      title: "app",
      path: "octo/app",
      description: "An app & more",
      language: { name: "Swift", color: null },
      stars: 1200,
      forks: 3,
      archived: true,
    });
    expect(svg).toContain(">app<");
    expect(svg).toContain("An app &amp; more");
    expect(svg).toContain(">1.2k<");
    expect(svg).toContain("#F05138");
    expect(svg).toContain(">Archived<");
    expect(svg).toContain(">GitHub<");
  });

  test("wakatime card shows the total and languages, or says it is calculating", () => {
    const stats = { range: "last_7_days" as const, total: "5 hrs", ready: true, languages: [{ name: "Swift", percent: 60, text: "3 hrs" }] };
    expect(renderWakaTimeCard(stats)).toContain("5 hrs in the last 7 days");
    expect(renderWakaTimeCard(stats, { layout: "compact" })).toContain("Swift – 3 hrs");
    expect(renderWakaTimeCard({ ...stats, ready: false })).toContain("still calculating");
  });

  test("minHeight stretches a card and svgHeight reads it", () => {
    const stats = { range: "all_time" as const, total: "5 hrs", ready: true, languages: [] };
    expect(svgHeight(renderWakaTimeCard(stats, { minHeight: 300 }))).toBe(300);
    expect(svgHeight(renderWakaTimeCard(stats))).toBeLessThan(300);
  });
});
