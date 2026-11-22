export const VIEWER_THEME_TOKEN_NAMES = [
  "--viewer-background",
  "--viewer-foreground",
  "--viewer-surface",
  "--viewer-muted",
  "--viewer-border",
  "--viewer-accent",
  "--viewer-accent-foreground",
  "--viewer-danger",
  "--viewer-warning",
  "--viewer-success",
  "--viewer-font-family",
  "--viewer-font-mono",
] as const;

export type ViewerThemeTokenName = (typeof VIEWER_THEME_TOKEN_NAMES)[number];

/** CSS custom-property expressions with dark-mode-safe fallbacks. */
export const viewerTheme = {
  background: "var(--viewer-background, #ffffff)",
  foreground: "var(--viewer-foreground, #111827)",
  surface: "var(--viewer-surface, color-mix(in srgb, var(--viewer-background, #ffffff) 94%, var(--viewer-foreground, #111827)))",
  muted: "var(--viewer-muted, color-mix(in srgb, var(--viewer-foreground, #111827) 62%, transparent))",
  border: "var(--viewer-border, color-mix(in srgb, var(--viewer-foreground, #111827) 14%, transparent))",
  accent: "var(--viewer-accent, #2563eb)",
  accentForeground: "var(--viewer-accent-foreground, #ffffff)",
  danger: "var(--viewer-danger, #dc2626)",
  warning: "var(--viewer-warning, #d97706)",
  success: "var(--viewer-success, #16a34a)",
  fontFamily: "var(--viewer-font-family, system-ui, -apple-system, sans-serif)",
  fontMono: "var(--viewer-font-mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace)",
} as const;
