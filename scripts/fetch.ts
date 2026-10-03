/**
 * Fetches real activity and prints a summary. Reads tokens from the
 * environment: GIC_GITHUB_TOKEN, GIC_GITLAB_TOKEN and optionally GIC_GITLAB_URL.
 * Writes the cache and activity JSON to .out/ so a second run is incremental.
 *
 *   bun run fetch
 */
import { mkdir } from "node:fs/promises";
import { collect, parseCache } from "@git-info-combine/core";

const cacheFile = Bun.file(".out/cache.json");
const cache = parseCache((await cacheFile.exists()) ? await cacheFile.text() : null);

const started = performance.now();
const { activity, cache: next } = await collect({
  githubToken: process.env.GIC_GITHUB_TOKEN,
  gitlabToken: process.env.GIC_GITLAB_TOKEN,
  gitlabUrl: process.env.GIC_GITLAB_URL,
  cache,
});
const seconds = ((performance.now() - started) / 1000).toFixed(1);

await mkdir(".out", { recursive: true });
await Bun.write(cacheFile, `${JSON.stringify(next, null, 2)}\n`);
await Bun.write(".out/activity.json", `${JSON.stringify(activity, null, 2)}\n`);

const dates = Object.keys(activity.days);
console.log(`Fetched in ${seconds}s (${cache ? "incremental" : "full"}).`);
console.log(`Days with activity: ${dates.length}, from ${dates[0]} to ${dates.at(-1)}`);
console.table(
  Object.fromEntries([
    ...activity.hosts.map((host) => [`${host.host} (${host.login})`, { ...host.totals, ...prefix("repos", host.repos) }]),
    ["combined", activity.totals],
  ]),
);
const languages = Object.entries(activity.languages)
  .sort(([, a], [, b]) => b.size - a.size)
  .slice(0, 8)
  .map(([name, stat]) => ({ name, kb: Math.round(stat.size / 1024), repos: stat.repos }));
console.table(languages);

function prefix(name: string, record: Record<string, number>) {
  return Object.fromEntries(Object.entries(record).map(([key, value]) => [`${name}.${key}`, value]));
}
