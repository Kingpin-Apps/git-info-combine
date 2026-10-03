import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  collect,
  parseCache,
  renderHeatmapCard,
  renderLanguagesCard,
  renderStatsCard,
  type CardName,
  type CardOptions,
  type Collected,
  type CollectOptions,
  type CombinedActivity,
} from "@git-info-combine/core";
import { commitAndPush } from "./git.ts";
import type { Config } from "./inputs.ts";

export interface Logger {
  info(message: string): void;
  warning(message: string): void;
}

export interface RunDeps {
  workspace: string;
  logger: Logger;
  collect?: (options: CollectOptions) => Promise<Collected>;
  commit?: typeof commitAndPush;
}

export interface RunResult {
  files: string[];
  committed: boolean;
}

/** Cards that are built today; the rest arrive in a later version. */
const RENDERERS: Partial<Record<CardName, (activity: CombinedActivity, config: Config, theme?: CardOptions) => string>> = {
  heatmap: (activity, config, theme) => renderHeatmapCard(activity, { ...config.heatmap, ...theme }),
  stats: (activity, config, theme) => renderStatsCard(activity, { ...config.stats, ...theme }),
  languages: (activity, config, theme) => renderLanguagesCard(activity, { ...config.languages, ...theme }),
};

export const CACHE_FILE = "cache.json";

export async function run(config: Config, deps: RunDeps): Promise<RunResult> {
  const { logger } = deps;
  const outputDir = join(deps.workspace, config.outputDir);
  const cachePath = join(outputDir, CACHE_FILE);
  const cache = parseCache(await readFile(cachePath, "utf8").catch(() => null));
  logger.info(cache ? "Using the cache from the last run." : "No cache found; fetching all history.");

  // collect() has already checked that neither of these holds a private name.
  // Cards are drawn only from the activity, so they cannot hold one either.
  const { activity, cache: nextCache } = await (deps.collect ?? collect)({
    githubToken: config.githubToken,
    gitlabToken: config.gitlabToken,
    gitlabUrl: config.gitlabUrl,
    includeOrgRepos: config.includeOrgRepos,
    excludeRepos: config.excludeRepos,
    cache,
  });

  for (const host of activity.hosts) {
    logger.info(
      `${host.host}: ${host.totals.contributions} contributions, ${host.repos.public} public and ${host.repos.private} private repos.`,
    );
  }

  const outputs: [string, string][] = [[CACHE_FILE, `${JSON.stringify(nextCache)}\n`]];
  const theme = config.heatmap.theme ?? "auto";
  for (const card of config.cards) {
    const render = RENDERERS[card];
    if (!render) {
      logger.warning(`The ${card} card is not available yet; skipping it.`);
      continue;
    }
    outputs.push([`${card}.svg`, render(activity, config)]);
    // With the auto theme, also write fixed light and dark files for a <picture>
    // tag, which follows GitHub's own theme setting rather than the system's.
    if (theme === "auto") {
      outputs.push([`${card}-light.svg`, render(activity, config, { theme: "light_github" })]);
      outputs.push([`${card}-dark.svg`, render(activity, config, { theme: "dark_github" })]);
    }
  }

  await mkdir(outputDir, { recursive: true });
  for (const [file, content] of outputs) await writeFile(join(outputDir, file), content);
  const files = outputs.map(([file]) => join(config.outputDir, file));
  logger.info(`Wrote ${files.length} files to ${config.outputDir}/.`);

  let committed = false;
  if (config.commit) {
    committed = await (deps.commit ?? commitAndPush)(deps.workspace, config.outputDir, config.commitMessage);
    logger.info(committed ? "Committed and pushed the cards." : "Cards unchanged; nothing to commit.");
  }
  return { files, committed };
}
