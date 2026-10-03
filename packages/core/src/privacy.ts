import { createHash } from "node:crypto";

/** A stable id for a repo or project that does not reveal its name. */
export function opaqueId(host: string, id: string | number): string {
  return createHash("sha256").update(`${host}:${id}`).digest("hex").slice(0, 16);
}

/**
 * Names a fetcher saw but must never write out: private repo and project
 * names and paths, and self-hosted GitLab hostnames.
 */
export class SensitiveNames {
  private readonly names = new Set<string>();
  private readonly allowed = new Set<string>();

  add(...names: (string | null | undefined)[]): void {
    for (const name of names) {
      const trimmed = name?.trim();
      if (trimmed) this.names.add(trimmed.toLowerCase());
    }
  }

  /** Public strings that may appear even if a private name matches them, such as the user's login. */
  allow(...names: string[]): void {
    for (const name of names) this.allowed.add(name.trim().toLowerCase());
  }

  merge(other: SensitiveNames): void {
    for (const name of other.names) this.names.add(name);
    for (const name of other.allowed) this.allowed.add(name);
  }

  get size(): number {
    return this.names.size;
  }

  /**
   * Throws if any string in `value` contains a sensitive name. Names shorter
   * than 6 characters without a `/` or `.` must match a whole string, so a
   * private repo called `app` does not trip on `approved`. Keys of `languages` maps are skipped:
   * language names come from the host's language detection, not the user.
   */
  assertAbsent(value: unknown, label: string): void {
    const found = this.find(value, false);
    if (found) {
      throw new Error(`Refusing to write ${label}: it contains a private name. This is a bug; please report it.`);
    }
  }

  private find(value: unknown, inLanguages: boolean): boolean {
    if (typeof value === "string") return this.matches(value);
    if (Array.isArray(value)) return value.some((item) => this.find(item, false));
    if (value && typeof value === "object") {
      return Object.entries(value).some(
        ([key, item]) => (!inLanguages && this.matches(key)) || this.find(item, key === "languages"),
      );
    }
    return false;
  }

  private matches(text: string): boolean {
    const lower = text.toLowerCase();
    if (this.allowed.has(lower)) return false;
    for (const name of this.names) {
      const loose = name.length >= 6 || name.includes("/") || name.includes(".");
      if (loose ? lower.includes(name) : lower === name) return true;
    }
    return false;
  }
}
