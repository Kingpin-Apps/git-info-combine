import { request, type HttpOptions } from "./http.ts";

export const WAKATIME_RANGES = ["last_7_days", "last_30_days", "last_6_months", "last_year", "all_time"] as const;
export type WakaTimeRange = (typeof WAKATIME_RANGES)[number];

export interface WakaTimeLanguage {
  name: string;
  /** Share of coding time, 0–100. */
  percent: number;
  /** Time as WakaTime writes it, for example "3 hrs 12 mins". */
  text: string;
}

export interface WakaTimeStats {
  range: WakaTimeRange;
  /** Total time as WakaTime writes it. */
  total: string;
  /** False while WakaTime is still calculating. */
  ready: boolean;
  languages: WakaTimeLanguage[];
}

export interface WakaTimeOptions extends HttpOptions {
  apiKey: string;
  /** API base. Defaults to WakaTime's; set it for Wakapi or another compatible server. */
  apiUrl?: string;
  range?: WakaTimeRange;
}

interface StatsResponse {
  data: {
    status?: string;
    is_up_to_date?: boolean;
    human_readable_total?: string;
    languages?: { name: string; percent: number; text: string }[];
  };
}

/**
 * The user's coding time by language. Only languages are kept; WakaTime also
 * returns project names, which may be private, and those are dropped here.
 */
export async function fetchWakaTime(options: WakaTimeOptions): Promise<WakaTimeStats> {
  const base = (options.apiUrl ?? "https://wakatime.com/api/v1").replace(/\/+$/, "");
  const range = options.range ?? "last_7_days";
  const response = await request(
    `${base}/users/current/stats/${range}`,
    { headers: { authorization: `Basic ${btoa(options.apiKey)}`, "user-agent": "git-info-combine" } },
    options,
  );
  const { data } = (await response.json()) as StatsResponse;
  return {
    range,
    total: data.human_readable_total ?? "0 secs",
    ready: data.status === undefined || data.status === "ok" || data.is_up_to_date === true,
    languages: (data.languages ?? []).map(({ name, percent, text }) => ({ name, percent, text })),
  };
}
