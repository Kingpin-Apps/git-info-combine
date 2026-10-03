import { describe, expect, test } from "bun:test";
import { CARD_NAMES, parseCards } from "../src/cards.ts";

describe("parseCards", () => {
  test("empty input means every card", () => {
    expect(parseCards("")).toEqual([...CARD_NAMES]);
  });

  test("all means every card", () => {
    expect(parseCards("all")).toEqual([...CARD_NAMES]);
  });

  test("accepts commas, newlines and mixed case, in canonical order", () => {
    expect(parseCards("Stats,\nheatmap  languages")).toEqual([
      "heatmap",
      "stats",
      "languages",
    ]);
  });

  test("drops duplicates", () => {
    expect(parseCards("pins,pins")).toEqual(["pins"]);
  });

  test("rejects unknown cards", () => {
    expect(() => parseCards("heatmap,streak")).toThrow("Unknown card(s): streak");
  });
});
