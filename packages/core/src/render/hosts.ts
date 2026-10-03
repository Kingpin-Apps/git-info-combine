import type { Host } from "../model.ts";
import { DEFAULT_HOST_COLORS, escapeXml, HOST_LABELS, hexColor } from "./svg.ts";

export type HostColors = Partial<Record<Host, string>>;

export function hostColor(host: Host, colors: HostColors = {}): string {
  const custom = colors[host];
  return custom ? hexColor(custom, `${HOST_LABELS[host]} colour`) : DEFAULT_HOST_COLORS[host];
}

/** A row of coloured dots naming each host, for card footers. */
export function hostLegend(hosts: Host[], colors: HostColors, x: number, y: number): { svg: string; width: number } {
  let offset = 0;
  const items = hosts.map((host) => {
    const label = HOST_LABELS[host];
    const item = `<circle cx="${x + offset + 5}" cy="${y - 4}" r="5" fill="${hostColor(host, colors)}"/><text class="small" x="${x + offset + 15}" y="${y}">${escapeXml(label)}</text>`;
    offset += 15 + label.length * 7 + 14;
    return item;
  });
  return { svg: items.join(""), width: offset };
}
