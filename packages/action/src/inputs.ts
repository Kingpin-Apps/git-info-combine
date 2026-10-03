import {
  CARD_NAMES,
  parseCards,
  STAT_NAMES,
  type CardName,
  type CardOptions,
  type HeatmapCardOptions,
  type LanguagesCardOptions,
  type StatName,
  type StatsCardOptions,
  type ShowcaseCardOptions,
  type WakaTimeCardOptions,
  type WakaTimeRange,
  WAKATIME_RANGES,
} from "@git-info-combine/core";

export type GetInput = (name: string) => string;

export interface Config {
  githubToken?: string;
  gitlabToken?: string;
  gitlabUrl?: string;
  includeOrgRepos: boolean;
  excludeRepos: string[];
  gitlabMirrors: string[];
  detectWordPress: boolean;
  cards: CardName[];
  outputDir: string;
  commit: boolean;
  commitMessage: string;
  /** Give cards that sit in a row the same height. */
  equalHeights: boolean;
  stats: StatsCardOptions;
  languages: LanguagesCardOptions;
  heatmap: HeatmapCardOptions;
  wakatime: WakaTimeCardOptions & { apiKey?: string; apiUrl?: string; range: WakaTimeRange };
  pins: string[];
  gists: string[];
  showcase: ShowcaseCardOptions;
}

/** Reads the Action's inputs. Every input is optional except a token. */
export function readConfig(getInput: GetInput): Config {
  const text = (name: string) => getInput(name).trim() || undefined;
  const list = (name: string) =>
    (text(name) ?? "")
      .split(/[\n,]+/)
      .map((item) => item.trim())
      .filter(Boolean);
  const bool = (name: string, fallback: boolean) => {
    const value = text(name)?.toLowerCase();
    if (value === undefined) return fallback;
    if (["true", "yes", "1"].includes(value)) return true;
    if (["false", "no", "0"].includes(value)) return false;
    throw new Error(`Input ${name} must be true or false, not "${value}".`);
  };
  const choice = <T extends string>(name: string, options: readonly T[]): T | undefined => {
    const value = text(name);
    if (value === undefined) return undefined;
    if (!options.includes(value as T)) throw new Error(`Input ${name} must be one of ${options.join(", ")}, not "${value}".`);
    return value as T;
  };
  const number = (name: string) => {
    const value = text(name);
    if (value === undefined) return undefined;
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`Input ${name} must be a positive number, not "${value}".`);
    return parsed;
  };

  const githubToken = text("github-token");
  const gitlabToken = text("gitlab-token");
  if (!githubToken && !gitlabToken) throw new Error("Set at least one of github-token and gitlab-token.");

  const common: CardOptions = {
    theme: text("theme"),
    hideTitle: bool("hide-title", false),
    hideBorder: bool("hide-border", false),
    borderRadius: number("border-radius"),
    titleColor: text("title-color"),
    iconColor: text("icon-color"),
    textColor: text("text-color"),
    bgColor: text("bg-color"),
    borderColor: text("border-color"),
  };
  const hostColors = { github: text("github-color"), gitlab: text("gitlab-color") };

  const hiddenStats = list("stats-hide");
  for (const stat of hiddenStats) {
    if (!STAT_NAMES.includes(stat as StatName)) {
      throw new Error(`Input stats-hide has an unknown stat "${stat}". Use ${STAT_NAMES.join(", ")}.`);
    }
  }

  return {
    githubToken,
    gitlabToken,
    gitlabUrl: text("gitlab-url"),
    includeOrgRepos: bool("include-org-repos", true),
    excludeRepos: list("exclude-repos"),
    gitlabMirrors: list("gitlab-mirrors"),
    detectWordPress: bool("detect-wordpress", true),
    cards: parseCards(getInput("cards")),
    outputDir: text("output-dir") ?? "git-info-combine",
    commit: bool("commit", true),
    commitMessage: text("commit-message") ?? "chore: update git-info-combine cards",
    equalHeights: bool("equal-heights", true),
    stats: {
      ...common,
      name: text("name"),
      hide: hiddenStats as StatName[],
      hideRank: bool("hide-rank", false),
      showHosts: bool("show-hosts", true),
      numberFormat: choice("number-format", ["short", "long"] as const),
      hostColors,
    },
    languages: {
      ...common,
      layout: choice("languages-layout", ["normal", "compact"] as const),
      count: number("languages-count"),
      hide: list("languages-hide"),
      weighting: choice("languages-weighting", ["repo", "size"] as const),
    },
    heatmap: {
      ...common,
      range: choice("heatmap-range", ["last-year", "all"] as const),
      mode: choice("heatmap-mode", ["hosts", "single"] as const),
      hostColors,
    },
    wakatime: {
      ...common,
      apiKey: text("wakatime-api-key"),
      apiUrl: text("wakatime-url"),
      range: choice("wakatime-range", WAKATIME_RANGES) ?? "last_7_days",
      layout: choice("wakatime-layout", ["normal", "compact"] as const),
      count: number("wakatime-count"),
      hide: list("wakatime-hide"),
    },
    pins: list("pins"),
    gists: list("gists"),
    showcase: { ...common, showHost: bool("show-hosts", true), hostColors },
  };
}

export { CARD_NAMES };
