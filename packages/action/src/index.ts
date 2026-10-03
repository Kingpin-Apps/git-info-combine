import * as core from "@actions/core";
import { parseCards } from "@git-info-combine/core";

try {
  const cards = parseCards(core.getInput("cards"));
  core.info(`Cards enabled: ${cards.join(", ")}`);
  core.info("Fetching and rendering are not implemented yet.");
} catch (error) {
  core.setFailed(error instanceof Error ? error.message : String(error));
}
