import { HttpError, request, type HttpOptions } from "./http.ts";
import type { Host } from "./model.ts";

/** A public repo, project, gist or snippet to show on its own card. */
export interface ShowcaseItem {
  kind: "repo" | "gist";
  host: Host;
  /** Name shown as the card title. */
  title: string;
  /** Full path or id, used to name the file. */
  path: string;
  description: string | null;
  language: { name: string; color: string | null } | null;
  stars: number;
  forks: number;
  archived: boolean;
}

export interface ShowcaseOptions extends HttpOptions {
  githubToken?: string;
  gitlabToken?: string;
  gitlabUrl?: string;
}

/**
 * Parses a pin or gist reference: `owner/repo`, `github:owner/repo`,
 * `gitlab:group/project`, `github:<gist id>` or `gitlab:<snippet id>`.
 * A reference with no host means GitHub.
 */
export function parseRef(ref: string): { host: Host; path: string } {
  const match = ref.trim().match(/^(github|gitlab):(.*)$/i);
  const host = (match?.[1]?.toLowerCase() ?? "github") as Host;
  const path = (match?.[2] ?? ref).trim().replace(/^\/+|\/+$/g, "");
  if (!path) throw new Error(`Empty reference "${ref}".`);
  return { host, path };
}

/** A missing or hidden item reads as an HTTP error; anything else is a real failure. */
const missing = (error: unknown) => {
  if (error instanceof HttpError) return null;
  throw error;
};

function notPublic(kind: string, ref: string): Error {
  return new Error(`Only public ${kind}s can be shown, and ${ref} is not public (or the token cannot see it).`);
}

async function githubGraphql<T>(options: ShowcaseOptions, query: string, variables: Record<string, unknown>): Promise<T> {
  if (!options.githubToken) throw new Error("github-token is needed to show GitHub pins and gists.");
  const response = await request(
    "https://api.github.com/graphql",
    {
      method: "POST",
      headers: { authorization: `bearer ${options.githubToken}`, "content-type": "application/json", "user-agent": "git-info-combine" },
      body: JSON.stringify({ query, variables }),
    },
    options,
  );
  const body = (await response.json()) as { data?: T; errors?: unknown[] };
  if (!body.data) throw new Error("GitHub GraphQL request failed.");
  return body.data;
}

async function gitlabGet<T>(options: ShowcaseOptions, path: string): Promise<T> {
  if (!options.gitlabToken) throw new Error("gitlab-token is needed to show GitLab pins and snippets.");
  const base = (options.gitlabUrl ?? "https://gitlab.com").replace(/\/+$/, "");
  const response = await request(
    `${base}/api/v4${path}`,
    { headers: { authorization: `Bearer ${options.gitlabToken}`, "user-agent": "git-info-combine" } },
    options,
  );
  return (await response.json()) as T;
}

export async function fetchPin(ref: string, options: ShowcaseOptions): Promise<ShowcaseItem> {
  const { host, path } = parseRef(ref);

  if (host === "github") {
    const [owner, name, ...rest] = path.split("/");
    if (!owner || !name || rest.length) throw new Error(`GitHub pins look like owner/repo, not "${ref}".`);
    const data = await githubGraphql<{
      repository: {
        name: string;
        nameWithOwner: string;
        description: string | null;
        isPrivate: boolean;
        isArchived: boolean;
        stargazerCount: number;
        forkCount: number;
        primaryLanguage: { name: string; color: string | null } | null;
      } | null;
    }>(
      options,
      `query ($owner: String!, $name: String!) { repository(owner: $owner, name: $name) {
        name nameWithOwner description isPrivate isArchived stargazerCount forkCount primaryLanguage { name color } } }`,
      { owner, name },
    );
    const repo = data.repository;
    if (!repo || repo.isPrivate) throw notPublic("repo", ref);
    return {
      kind: "repo",
      host,
      title: repo.name,
      path: repo.nameWithOwner,
      description: repo.description,
      language: repo.primaryLanguage,
      stars: repo.stargazerCount,
      forks: repo.forkCount,
      archived: repo.isArchived,
    };
  }

  const project = await gitlabGet<{
    name: string;
    path_with_namespace: string;
    description: string | null;
    visibility: string;
    archived: boolean;
    star_count: number;
    forks_count: number;
    id: number;
  }>(options, `/projects/${encodeURIComponent(path)}`).catch(missing);
  if (!project || project.visibility !== "public") throw notPublic("project", ref);
  const languages = await gitlabGet<Record<string, number>>(options, `/projects/${project.id}/languages`);
  const top = Object.entries(languages).sort(([, a], [, b]) => b - a)[0];
  return {
    kind: "repo",
    host,
    title: project.name,
    path: project.path_with_namespace,
    description: project.description || null,
    language: top ? { name: top[0], color: null } : null,
    stars: project.star_count,
    forks: project.forks_count,
    archived: project.archived,
  };
}

export async function fetchGist(ref: string, options: ShowcaseOptions): Promise<ShowcaseItem> {
  const { host, path } = parseRef(ref);

  if (host === "github") {
    const data = await githubGraphql<{
      viewer: {
        gist: {
          name: string;
          description: string | null;
          isPublic: boolean;
          stargazerCount: number;
          forks: { totalCount: number };
          files: { name: string; language: { name: string; color: string | null } | null }[] | null;
        } | null;
      };
    }>(
      options,
      `query ($name: String!) { viewer { gist(name: $name) {
        name description isPublic stargazerCount forks { totalCount } files(limit: 10) { name language { name color } } } } }`,
      { name: path },
    );
    const gist = data.viewer.gist;
    if (!gist || !gist.isPublic) throw notPublic("gist", ref);
    const first = gist.files?.[0];
    return {
      kind: "gist",
      host,
      title: first?.name ?? gist.name,
      path: gist.name,
      description: gist.description,
      language: gist.files?.find((file) => file.language)?.language ?? null,
      stars: gist.stargazerCount,
      forks: gist.forks.totalCount,
      archived: false,
    };
  }

  const snippet = await gitlabGet<{
    id: number;
    title: string;
    description: string | null;
    visibility: string;
    file_name?: string;
    files?: { path: string }[];
  }>(options, `/snippets/${encodeURIComponent(path)}`).catch(missing);
  if (!snippet || snippet.visibility !== "public") throw notPublic("snippet", ref);
  return {
    kind: "gist",
    host,
    title: snippet.title || snippet.files?.[0]?.path || snippet.file_name || `Snippet ${snippet.id}`,
    path: String(snippet.id),
    description: snippet.description || null,
    language: null,
    stars: 0,
    forks: 0,
    archived: false,
  };
}
