import { describe, expect, test } from "bun:test";
import { opaqueId, SensitiveNames } from "../src/privacy.ts";

describe("SensitiveNames", () => {
  const names = () => {
    const sensitive = new SensitiveNames();
    sensitive.add("client-portal-x", "acme/client-portal-x", "app", "git.corp.internal");
    return sensitive;
  };

  test("finds long names inside strings, in values and keys, at any depth", () => {
    expect(() => names().assertAbsent({ a: [{ b: "pinned client-portal-x" }] }, "x")).toThrow();
    expect(() => names().assertAbsent({ "Client-Portal-X": 1 }, "x")).toThrow();
    expect(() => names().assertAbsent("https://git.corp.internal/x", "x")).toThrow();
  });

  test("short names must match a whole string", () => {
    expect(() => names().assertAbsent({ action: "approved" }, "x")).not.toThrow();
    expect(() => names().assertAbsent({ repo: "App" }, "x")).toThrow();
  });

  test("language names are allowed", () => {
    const sensitive = new SensitiveNames();
    sensitive.add("Swift");
    expect(() => sensitive.assertAbsent({ languages: { Swift: { size: 1 } } }, "x")).not.toThrow();
    expect(() => sensitive.assertAbsent({ name: "Swift" }, "x")).toThrow();
  });

  test("allowed strings, such as the login, never trip", () => {
    const sensitive = new SensitiveNames();
    sensitive.add("kingpin", "kingpinapps");
    sensitive.allow("KingpinApps");
    expect(() => sensitive.assertAbsent({ login: "KingpinApps" }, "x")).not.toThrow();
    expect(() => sensitive.assertAbsent({ title: "kingpin tools" }, "x")).toThrow();
  });

  test("the error does not repeat the name", () => {
    expect(() => names().assertAbsent("client-portal-x", "the cache")).toThrow(
      "Refusing to write the cache: it contains a private name. This is a bug; please report it.",
    );
  });
});

test("opaqueId is stable and hides the input", () => {
  expect(opaqueId("gitlab", 12)).toBe(opaqueId("gitlab", "12"));
  expect(opaqueId("gitlab", 12)).not.toBe(opaqueId("github", 12));
  expect(opaqueId("gitlab", 12)).toMatch(/^[0-9a-f]{16}$/);
});
