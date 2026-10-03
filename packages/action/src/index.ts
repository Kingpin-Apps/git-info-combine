import * as core from "@actions/core";
import { readConfig } from "./inputs.ts";
import { run } from "./run.ts";

try {
  const config = readConfig((name) => core.getInput(name));
  for (const token of [config.githubToken, config.gitlabToken]) if (token) core.setSecret(token);
  const result = await run(config, {
    workspace: process.env.GITHUB_WORKSPACE ?? process.cwd(),
    logger: { info: core.info, warning: core.warning },
  });
  core.setOutput("files", result.files.join("\n"));
  core.setOutput("committed", String(result.committed));
} catch (error) {
  core.setFailed(error instanceof Error ? error.message : String(error));
}
