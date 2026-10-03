import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  collect,
  fetchGist,
  fetchPin,
  fetchWakaTime,
  parseCache,
  parseRef,
  renderHeatmapCard,
  renderLanguagesCard,
  renderShowcaseCard,
  renderStatsCard,
  renderWakaTimeCard,
  svgHeight,
  type CardOptions,
  type Collected,
  type CollectOptions,
  type ShowcaseItem,
  type ShowcaseOptions,
  type WakaTimeOptions,
  type WakaTimeStats,
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
  wakatime?: (options: WakaTimeOptions) => Promise<WakaTimeStats>;
  pin?: (ref: string, options: ShowcaseOptions) => Promise<ShowcaseItem>;
  gist?: (ref: string, options: ShowcaseOptions) => Promise<ShowcaseItem>;
  commit?: typeof commitAndPush;
}

export interface RunResult {
  files: string[];
  committed: boolean;
}

export const CACHE_FILE = "cache.json";

/** A card to write, drawn with extra options such as a theme or a minimum height. */
interface Card {
  file: string;
  /** Cards in the same row get the same height. */
  row: "summary" | "showcase" | null;
  render: (extra: CardOptions) => string;
}

export async function run(config: Config, deps: RunDeps): Promise<RunResult> {
  const { logger } = deps;
  const outputDir = join(deps.workspace, config.outputDir);
  const cachePath = join(outputDir, CACHE_FILE);
  const cache = parseCache(await readFile(cachePath, "utf8").catch(() => null));
  logger.info(cache ? "Using the cache from the last run." : "No cache found; fetching all history.");

  // collect() has already checked that neither of these holds a private name.
  // The heatmap, stats and languages cards are drawn only from the activity.
  const { activity, mirrored, cache: nextCache } = await (deps.collect ?? collect)({
    githubToken: config.githubToken,
    gitlabToken: config.gitlabToken,
    gitlabUrl: config.gitlabUrl,
    includeOrgRepos: config.includeOrgRepos,
    excludeRepos: config.excludeRepos,
    gitlabMirrors: config.gitlabMirrors,
    detectWordPress: config.detectWordPress,
    cache,
  });
  if (mirrored > 0) logger.info(`${mirrored} GitLab projects mirror GitHub repos and are counted once.`);
  for (const host of activity.hosts) {
    logger.info(
      `${host.host}: ${host.totals.contributions} contributions, ${host.repos.public} public and ${host.repos.private} private repos.`,
    );
  }

  const showcaseOptions: ShowcaseOptions = {
    githubToken: config.githubToken,
    gitlabToken: config.gitlabToken,
    gitlabUrl: config.gitlabUrl,
  };
  const cards: Card[] = [];
  for (const card of config.cards) {
    switch (card) {
      case "heatmap":
        cards.push({ file: "heatmap", row: null, render: (extra) => renderHeatmapCard(activity, { ...config.heatmap, ...extra }) });
        break;
      case "stats":
        cards.push({ file: "stats", row: "summary", render: (extra) => renderStatsCard(activity, { ...config.stats, ...extra }) });
        break;
      case "languages":
        cards.push({ file: "languages", row: "summary", render: (extra) => renderLanguagesCard(activity, { ...config.languages, ...extra }) });
        break;
      case "wakatime": {
        const { apiKey, apiUrl, range } = config.wakatime;
        if (!apiKey) {
          logger.info("Skipping the wakatime card: set wakatime-api-key to show it.");
          break;
        }
        const stats = await (deps.wakatime ?? fetchWakaTime)({ apiKey, apiUrl, range });
        cards.push({ file: "wakatime", row: "summary", render: (extra) => renderWakaTimeCard(stats, { ...config.wakatime, ...extra }) });
        break;
      }
      case "pins":
      case "gists": {
        const refs = card === "pins" ? config.pins : config.gists;
        if (refs.length === 0) {
          logger.info(`Skipping the ${card} cards: list some in the ${card} input to show them.`);
          break;
        }
        const fetch = card === "pins" ? (deps.pin ?? fetchPin) : (deps.gist ?? fetchGist);
        for (const ref of refs) {
          // Pins and gists are public by definition: fetchPin and fetchGist refuse anything else.
          const item = await fetch(ref, showcaseOptions);
          const { host, path } = parseRef(ref);
          cards.push({
            file: `${card === "pins" ? "pin" : "gist"}-${host}-${slug(path)}`,
            row: "showcase",
            render: (extra) => renderShowcaseCard(item, { ...config.showcase, ...extra }),
          });
        }
        break;
      }
    }
  }

  // Match heights within each row: draw once, measure, then draw with the tallest height.
  const minHeight = new Map<Card["row"], number>();
  if (config.equalHeights) {
    for (const card of cards) {
      if (!card.row) continue;
      minHeight.set(card.row, Math.max(minHeight.get(card.row) ?? 0, svgHeight(card.render({}))));
    }
  }

  const outputs: [string, string][] = [[CACHE_FILE, `${JSON.stringify(nextCache)}\n`]];
  const autoTheme = (config.stats.theme ?? "auto") === "auto";
  for (const card of cards) {
    const sized: CardOptions = { minHeight: minHeight.get(card.row) };
    outputs.push([`${card.file}.svg`, card.render(sized)]);
    // With the auto theme, also write fixed light and dark files for a <picture>
    // tag, which follows GitHub's own theme setting rather than the system's.
    if (autoTheme) {
      outputs.push([`${card.file}-light.svg`, card.render({ ...sized, theme: "light_github" })]);
      outputs.push([`${card.file}-dark.svg`, card.render({ ...sized, theme: "dark_github" })]);
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

/** `Kingpin-Apps/git-info-combine` → `kingpin-apps-git-info-combine`. */
export function slug(path: string): string {
  return path.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
