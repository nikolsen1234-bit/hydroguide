---
version: alpha
name: HydroGuide
description: "A compact engineering design system for planning, sizing, and documenting remote small-hydropower intake equipment."
colors:
  primary: "#1d4ed8"
  on-primary: "#ffffff"
  primary-hover: "#2563eb"
  primary-soft: "#eef4ff"
  background: "#f6f7f9"
  surface: "#ffffff"
  surface-alt: "#f8fafc"
  surface-muted: "#eef1f4"
  ink: "#0b1320"
  ink-soft: "#1f2937"
  muted: "#1f2937"
  hairline: "#e6e9ee"
  hairline-soft: "#eef1f4"
  rail: "#0b1320"
  rail-panel: "#10192b"
  rail-border: "#1f2738"
  rail-divider: "#1a2438"
  rail-text: "#cfd6e2"
  rail-text-muted: "#7e8ca6"
  rail-text-active: "#ffffff"
  rail-active-fill: "#ffffff14"
  success: "#047857"
  success-soft: "#ecfdf5"
  warning: "#b45309"
  warning-soft: "#fffbeb"
  danger: "#be123c"
  danger-soft: "#fff1f2"
  chart-solar: "#f59e0b"
  chart-solar-fill: "#fbbf24"
  chart-battery: "#94a3b8"
  chart-battery-fill: "#cbd5e1"
  chart-load: "#334155"
  chart-reserve: "#2563eb"
  chart-methanol: "#16a34a"
  chart-diesel: "#b91c1c"
  chart-positive: "#2563eb"
  chart-negative: "#e11d48"
  map-line: "#2563eb"
  dark-background: "#0b1018"
  dark-surface: "#10151f"
  dark-surface-alt: "#161c2a"
  dark-ink: "#e6edf7"
  dark-ink-soft: "#c4cdde"
  dark-muted: "#c4cdde"
  dark-hairline: "#1f2738"
  dark-hairline-soft: "#1a2030"
  dark-primary: "#7aa2ff"
  dark-primary-hover: "#5a87f0"
  dark-primary-soft: "#172244"
  dark-rail: "#070b13"
  dark-rail-text: "#a3afc6"
  dark-rail-text-active: "#f5f9ff"
typography:
  display-hero:
    fontFamily: Manrope
    fontSize: 44px
    fontWeight: 800
    lineHeight: 1.05
    letterSpacing: -0.02em
  display-hero-compact:
    fontFamily: Manrope
    fontSize: 37px
    fontWeight: 800
    lineHeight: 1.05
    letterSpacing: -0.02em
  hero-subtitle:
    fontFamily: Manrope
    fontSize: 22px
    fontWeight: 700
    lineHeight: 1.18
    letterSpacing: -0.02em
  page-title:
    fontFamily: Manrope
    fontSize: 24px
    fontWeight: 800
    lineHeight: 1.08
    letterSpacing: -0.03em
  section-title:
    fontFamily: Manrope
    fontSize: 18px
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: -0.01em
  content-title:
    fontFamily: Manrope
    fontSize: 15px
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: -0.02em
  body-md:
    fontFamily: Manrope
    fontSize: 13px
    fontWeight: 400
    lineHeight: 1.55
    letterSpacing: 0em
  body-lg:
    fontFamily: Manrope
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.52
    letterSpacing: 0em
  ui-md:
    fontFamily: Manrope
    fontSize: 13px
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: 0em
  label-caps:
    fontFamily: Manrope
    fontSize: 11px
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: 0.16em
  meta-caps:
    fontFamily: ui-monospace
    fontSize: 12px
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: 0.14em
    fontFeature: "\"tnum\" 1"
  breadcrumb:
    fontFamily: ui-monospace
    fontSize: 10px
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: 0.18em
    fontFeature: "\"tnum\" 1"
  chart-label:
    fontFamily: Manrope
    fontSize: 12px
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: 0em
  chart-tooltip:
    fontFamily: Manrope
    fontSize: 11px
    fontWeight: 500
    lineHeight: 1.35
    letterSpacing: 0em
rounded:
  none: 0px
  xs: 4px
  sm: 6px
  md: 8px
  lg: 10px
  full: 9999px
spacing:
  none: 0px
  hairline: 1px
  divider: 2px
  xxs: 2px
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 18px
  "2xl": 20px
  "3xl": 24px
  "4xl": 28px
  "5xl": 32px
  page-x-mobile: 16px
  page-x-tablet: 24px
  page-x-desktop: 28px
  page-bottom: 32px
  sidebar-width: 232px
  mobile-header-height: 56px
  workspace-header-y: 16px
  section-padding: 16px
  section-gap: 16px
  nav-gap: 18px
  control-height: 40px
  compact-control-height: 38px
  field-height: 40px
  tall-field-height: 48px
  map-marker-size: 34px
shadows:
  none: "none"
  soft: "0 8px 28px -16px rgba(15, 23, 42, 0.18)"
  overlay: "0 18px 48px rgba(11, 19, 32, 0.22)"
elevation:
  flat:
    shadow: "none"
    borderWidth: 1px
  raised:
    shadow: "0 8px 28px -16px rgba(15, 23, 42, 0.18)"
    borderWidth: 1px
  drawer:
    shadow: "0 18px 48px rgba(11, 19, 32, 0.22)"
    borderWidth: 1px
motion:
  instant: 0ms
  fast: 150ms
  standard: 300ms
  rise: 350ms
  easing-standard: "ease"
  easing-out: "ease-out"
borders:
  hairline: "1px solid #e6e9ee"
  hairline-soft: "1px solid #eef1f4"
  accent: "1px solid #2563eb"
  active-rail: "2px solid #2563eb"
  editorial-divider: "2px solid #0b1320"
components:
  app-shell:
    backgroundColor: "{colors.background}"
    textColor: "{colors.ink}"
    typography: "{typography.body-md}"
    rounded: "{rounded.none}"
  sidebar-rail:
    backgroundColor: "{colors.rail}"
    textColor: "{colors.rail-text}"
    width: "{spacing.sidebar-width}"
    rounded: "{rounded.none}"
  sidebar-item:
    backgroundColor: "transparent"
    textColor: "{colors.rail-text}"
    typography: "{typography.ui-md}"
    rounded: "{rounded.md}"
    height: 36px
    padding: 12px
  sidebar-item-active:
    backgroundColor: "{colors.rail-active-fill}"
    textColor: "{colors.rail-text-active}"
    typography: "{typography.ui-md}"
    rounded: "{rounded.md}"
  workspace-header:
    backgroundColor: "{colors.primary-soft}"
    textColor: "{colors.ink}"
    typography: "{typography.page-title}"
    rounded: "{rounded.none}"
    padding: 16px
  editorial-section:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: 16px
  data-panel:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: 16px
  empty-panel:
    backgroundColor: "{colors.surface-alt}"
    textColor: "{colors.muted}"
    rounded: "{rounded.md}"
    padding: 24px
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.ui-md}"
    rounded: "{rounded.md}"
    height: 40px
    padding: 16px
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
    textColor: "{colors.on-primary}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.ui-md}"
    rounded: "{rounded.md}"
    height: 40px
    padding: 16px
  button-danger:
    backgroundColor: "{colors.danger-soft}"
    textColor: "{colors.danger}"
    typography: "{typography.ui-md}"
    rounded: "{rounded.md}"
    height: 40px
    padding: 16px
  header-action:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.ui-md}"
    rounded: "{rounded.none}"
    height: 38px
    padding: 10px
  text-input:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.ui-md}"
    rounded: "{rounded.none}"
    height: 40px
    padding: 8px
  text-input-focus:
    backgroundColor: "{colors.primary-soft}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
  tall-input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.ui-md}"
    rounded: "{rounded.md}"
    height: 48px
    padding: 16px
  choice-active:
    backgroundColor: "{colors.primary-soft}"
    textColor: "{colors.primary}"
    typography: "{typography.label-caps}"
    rounded: "{rounded.md}"
    height: 36px
  choice-idle:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.label-caps}"
    rounded: "{rounded.md}"
    height: 36px
  tooltip:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink-soft}"
    typography: "{typography.body-md}"
    rounded: "{rounded.md}"
    padding: 12px
  badge-success:
    backgroundColor: "{colors.success-soft}"
    textColor: "{colors.success}"
    typography: "{typography.label-caps}"
    rounded: "{rounded.full}"
    padding: 8px
  badge-warning:
    backgroundColor: "{colors.warning-soft}"
    textColor: "{colors.warning}"
    typography: "{typography.label-caps}"
    rounded: "{rounded.full}"
    padding: 8px
  map-marker-primary:
    backgroundColor: "{colors.primary-soft}"
    textColor: "{colors.primary}"
    typography: "{typography.chart-label}"
    rounded: "{rounded.md}"
    width: 34px
    height: 34px
  map-marker-warning:
    backgroundColor: "{colors.warning-soft}"
    textColor: "{colors.warning}"
    typography: "{typography.chart-label}"
    rounded: "{rounded.md}"
    width: 34px
    height: 34px
---

## Overview

HydroGuide is a quiet, utilitarian engineering workspace. It should feel precise, controlled, and built for repeated technical work rather than marketing. The visual identity combines a dark fixed navigation rail with light, data-dense work surfaces and a restrained blue accent for primary action, focus, active navigation, and key highlights.

The product should look like a professional planning tool for hydropower intake equipment: compact, structured, readable, and exact. Large decorative gestures are rare. The main exception is the welcome screen, which uses a pale oversized wave mark to connect the interface to the HydroGuide brand while keeping the working area calm.

## Colors

The light theme is the default identity. It uses a pale gray application background, white work panels, dark ink text, and a strong operational blue. The blue should be used with discipline: primary actions, active modes, focus states, selected navigation, chart emphasis, and map connection lines.

The left rail is intentionally much darker than the workspace. It anchors the app, improves scan speed, and creates a clear boundary between navigation and engineering content. Rail text is muted until active or hovered.

Semantic colors are functional rather than expressive. Green means valid, available, or successful. Amber means warning, alternate point, or attention. Red and rose are reserved for destructive actions, negative balance, failed validation, or diesel/emissions semantics in charts.

Dark theme preserves the same structure: dark background and surfaces, light ink, muted blue rail text, and a softer blue primary. Do not introduce new hues in dark mode; translate the existing roles.

## Typography

HydroGuide uses Manrope as the primary typeface. It should read as modern, technical, and friendly without becoming playful. Use heavy weights for page titles and important values, medium or semibold weights for controls, and regular body text for explanations.

Use compact typography by default. The product is a working calculator and documentation tool, so headings should be strong but not oversized inside panels. Hero-scale type is reserved for the welcome screen and the brand name.

Use a monospace stack only for metadata, breadcrumbs, units, compact labels, timestamps, and numeric-heavy support text. Monospace labels are uppercase with generous tracking. Numeric values should use tabular figures wherever possible so tables, charts, and calculated results align cleanly.

## Layout

The primary desktop layout is a fixed 232px navigation rail and a scrollable workspace. Mobile switches to a 56px top bar with a slide-in navigation drawer. Work pages use compact page padding, sticky headers, and content sections arranged for scanning across forms, maps, charts, and result tables.

Spacing follows a small, practical scale. Forms and panels are dense but not cramped: 16px is the common internal padding, 12px to 16px handles field and control grouping, and 24px is reserved for empty states or broader breathing room.

Prefer aligned grids, table-like structures, and consistent control heights. Avoid uneven card mosaics or decorative section layouts. When content becomes complex, divide it with hairline borders, section headers, and subtle background changes rather than large shadows.

## Elevation & Depth

HydroGuide is mostly flat. Hierarchy comes from contrast, borders, tonal surfaces, active left rules, and sticky placement. Heavy shadows are not part of the default product language.

Use shadows only for true overlays, drawers, or temporary floating surfaces. Standard cards and panels should remain grounded with borders and pale fills. If a surface needs emphasis, prefer a stronger border, an accent strip, or a slightly tinted background before adding elevation.

## Shapes

The shape language is engineered and restrained. Many editorial sections are square and border-led. Form controls can be sharp when they behave like data-entry rows, while buttons, choice controls, map markers, tooltips, and contained data panels use small 6px to 10px radii.

Do not mix large pill shapes into ordinary work surfaces. Fully rounded shapes are acceptable for tiny status dots, avatar initials, and compact badges only.

## Components

Primary buttons use solid HydroGuide blue with white text. Secondary buttons use white surfaces, dark text, and hairline borders. Header action buttons are flatter and more editorial: transparent background, left accent rule for the primary action, compact icon, label, optional sublabel, and a trailing chevron.

Inputs prioritize data entry. Standard inputs are transparent with a bottom border and become softly blue on focus. Taller inputs and select fields can use a white filled surface with a hairline border. Validation should appear close to the field and use red without changing the overall layout rhythm.

Sections are editorial rather than card-heavy. Use strong title text, compact uppercase metadata, and, where needed, 2px dividers. Empty states use pale filled panels with dashed or subtle borders, centered text, and one clear action.

Charts should feel native to the workspace. Use muted axes, tabular numeric labels, restrained grid lines, and the chart color tokens for meaning. Do not use decorative gradients in charts. Maps should keep native map detail visible while HydroGuide overlays use small branded markers, thin blue lines, and compact white labels.

## Do's and Don'ts

- Do keep screens dense, aligned, and work-focused.
- Do use the dark rail as the main navigation anchor.
- Do use blue sparingly for action, focus, active state, and selected data.
- Do use borders and tonal surfaces before shadows.
- Do keep typography compact inside panels and tables.
- Do preserve tabular numeric styling for calculations, units, and charts.
- Don't create marketing-style hero sections inside the application workspace.
- Don't add decorative gradient backgrounds, glow effects, or large soft shadows.
- Don't make ordinary cards heavily rounded or floating.
- Don't use new accent colors when an existing semantic role already fits.
- Don't place long explanatory copy inside controls, badges, or dense data cells.
