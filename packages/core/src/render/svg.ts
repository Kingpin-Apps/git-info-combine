import type { Host } from "../model.ts";
import { themes, type Theme } from "./themes.ts";

export const FONT = "'Segoe UI', Ubuntu, 'Helvetica Neue', Sans-Serif";

export const HOST_LABELS: Record<Host, string> = { github: "GitHub", gitlab: "GitLab" };
export const DEFAULT_HOST_COLORS: Record<Host, string> = { github: "#40c463", gitlab: "#fc6d26" };

/** Colour overrides, as hex with or without `#`. They apply in light and dark mode. */
export interface ColorOverrides {
  titleColor?: string;
  iconColor?: string;
  textColor?: string;
  bgColor?: string;
  borderColor?: string;
}

export interface CardOptions extends ColorOverrides {
  /**
   * A theme from GitHub Stats Extended, or `auto` (the default), which follows
   * the viewer's light or dark mode.
   */
  theme?: string;
  hideTitle?: boolean;
  hideBorder?: boolean;
  borderRadius?: number;
  customTitle?: string;
  /** Draw the card at least this tall, so cards in a row can match. */
  minHeight?: number;
  /** Card width in pixels, for fitting cards into a row. Each card has its own default. */
  width?: number;
}

interface Palette {
  title: string;
  icon: string;
  text: string;
  bg: string;
  border: string;
}

export interface ColorScheme {
  light: Palette;
  dark?: Palette;
  /** Set when the theme's background is a gradient: angle, then colours. */
  gradient?: { angle: number; colors: string[] };
}

export function escapeXml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]!);
}

/** `1234` → `1.2k`, as GitHub Stats Extended shows numbers; or `1,234` in long form. */
export function formatNumber(value: number, format: "short" | "long" = "short"): string {
  if (format === "long" || Math.abs(value) < 1000) return value.toLocaleString("en-US");
  return `${Math.sign(value) * Number.parseFloat((Math.abs(value) / 1000).toFixed(1))}k`;
}

/** Validates a hex colour from user input, so it cannot inject CSS. */
export function hexColor(value: string, label = "colour"): string {
  const hex = value.trim().replace(/^#/, "");
  if (!/^([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(hex)) {
    throw new Error(`Invalid ${label} "${value}": use a hex colour such as #2f80ed.`);
  }
  return `#${hex}`;
}

export function resolveScheme(options: CardOptions = {}): ColorScheme {
  const name = options.theme ?? "auto";
  const scheme: ColorScheme =
    name === "auto"
      ? { light: palette(themes.light_github!), dark: palette(themes.dark_github!) }
      : namedScheme(name);

  const overrides: Partial<Palette> = {};
  if (options.titleColor) overrides.title = hexColor(options.titleColor, "title colour");
  if (options.iconColor) overrides.icon = hexColor(options.iconColor, "icon colour");
  if (options.textColor) overrides.text = hexColor(options.textColor, "text colour");
  if (options.bgColor) overrides.bg = hexColor(options.bgColor, "background colour");
  if (options.borderColor) overrides.border = hexColor(options.borderColor, "border colour");
  if (overrides.bg) delete scheme.gradient;

  scheme.light = { ...scheme.light, ...overrides };
  if (scheme.dark) scheme.dark = { ...scheme.dark, ...overrides };
  return scheme;
}

function namedScheme(name: string): ColorScheme {
  const theme = themes[name];
  if (!theme) throw new Error(`Unknown theme "${name}". Use auto or a GitHub Stats Extended theme name.`);
  const parts = theme.bg_color.split(",");
  if (parts.length > 1) {
    const [angle, ...colors] = parts;
    return {
      light: palette({ ...theme, bg_color: colors[0]! }),
      gradient: { angle: Number(angle), colors: colors.map((c) => hexColor(c)) },
    };
  }
  return { light: palette(theme) };
}

function palette(theme: Theme): Palette {
  return {
    title: hexColor(theme.title_color),
    icon: hexColor(theme.icon_color),
    text: hexColor(theme.text_color),
    bg: hexColor(theme.bg_color),
    border: hexColor(theme.border_color ?? "e4e2e2"),
  };
}

function variables(palette: Palette, gradient: boolean): string {
  return [
    `--title:${palette.title}`,
    `--icon:${palette.icon}`,
    `--text:${palette.text}`,
    `--bg:${gradient ? "url(#bg-gradient)" : palette.bg}`,
    `--border:${palette.border}`,
  ].join(";");
}

export interface FrameOptions extends CardOptions {
  width: number;
  height: number;
  /** Default title, replaced by `customTitle`. */
  title: string;
  /** Plain-text summary for screen readers. */
  description: string;
  body: string;
  /** Extra CSS for the card. */
  css?: string;
}

/** The card's background, border, title and colours. The body is drawn below the title. */
export function renderFrame(options: FrameOptions): string {
  const scheme = resolveScheme(options);
  const { width } = options;
  const height = Math.max(options.height, options.minHeight ?? 0);
  const title = options.customTitle ?? options.title;
  const radius = options.borderRadius ?? 4.5;
  const gradient = scheme.gradient
    ? `<defs><linearGradient id="bg-gradient" gradientTransform="rotate(${scheme.gradient.angle})">${scheme.gradient.colors
        .map((color, i, all) => `<stop offset="${(i / Math.max(all.length - 1, 1)) * 100}%" stop-color="${color}"/>`)
        .join("")}</linearGradient></defs>`
    : "";
  const dark = scheme.dark
    ? `@media (prefers-color-scheme: dark){svg{${variables(scheme.dark, false)}}}`
    : "";

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="none" role="img" aria-labelledby="title desc">`,
    `<title id="title">${escapeXml(title)}</title>`,
    `<desc id="desc">${escapeXml(options.description)}</desc>`,
    gradient,
    `<style>`,
    `svg{${variables(scheme.light, Boolean(scheme.gradient))}}${dark}`,
    `.bg{fill:var(--bg);stroke:var(--border)}`,
    `.title{font:600 18px ${FONT};fill:var(--title)}`,
    `.text{font:400 14px ${FONT};fill:var(--text)}`,
    `.small{font:400 12px ${FONT};fill:var(--text)}`,
    `.bold{font-weight:700}`,
    `.icon{fill:var(--icon)}`,
    options.css ?? "",
    `</style>`,
    `<rect class="bg" x="0.5" y="0.5" rx="${radius}" width="${width - 1}" height="${height - 1}"${options.hideBorder ? ` stroke-opacity="0"` : ""}/>`,
    options.hideTitle ? "" : `<text class="title" x="25" y="35">${escapeXml(title)}</text>`,
    `<g transform="translate(0 ${titleOffset(options)})">${options.body}</g>`,
    `</svg>`,
  ].join("");
}

/** Reads a rendered card's height. */
export function svgHeight(svg: string): number {
  return Number(svg.match(/<svg[^>]* height="(\d+(?:\.\d+)?)"/)?.[1] ?? 0);
}

/** Reads a rendered card's width. */
export function svgWidth(svg: string): number {
  return Number(svg.match(/<svg[^>]* width="(\d+(?:\.\d+)?)"/)?.[1] ?? 0);
}

/** Wraps text to lines of at most `width` characters, ending with an ellipsis past `maxLines`. */
export function wrapText(text: string, width: number, maxLines: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (line && (line + " " + word).length > width) {
      lines.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = `${kept[maxLines - 1]!.slice(0, width - 1).trimEnd()}…`;
    return kept;
  }
  return lines.map((l) => (l.length > width ? `${l.slice(0, width - 1)}…` : l));
}

/** Height a card's title takes, so cards can size themselves. */
export function titleOffset(options: CardOptions): number {
  return options.hideTitle ? 35 : 68;
}
