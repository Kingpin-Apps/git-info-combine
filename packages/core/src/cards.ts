export const CARD_NAMES = [
  "heatmap",
  "stats",
  "languages",
  "wakatime",
  "pins",
  "gists",
] as const;

export type CardName = (typeof CARD_NAMES)[number];

/** Parses the `cards` input: a comma- or newline-separated list, or `all`. */
export function parseCards(input: string): CardName[] {
  const names = input
    .split(/[\s,]+/)
    .map((name) => name.trim().toLowerCase())
    .filter((name) => name.length > 0);

  if (names.length === 0 || names.includes("all")) {
    return [...CARD_NAMES];
  }

  const unknown = names.filter((name) => !isCardName(name));
  if (unknown.length > 0) {
    throw new Error(
      `Unknown card(s): ${unknown.join(", ")}. Valid cards: ${CARD_NAMES.join(", ")}, all.`,
    );
  }

  return CARD_NAMES.filter((name) => names.includes(name));
}

function isCardName(name: string): name is CardName {
  return (CARD_NAMES as readonly string[]).includes(name);
}
