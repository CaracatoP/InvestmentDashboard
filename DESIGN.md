---
version: alpha
name: Invest Hub
description: Personal investment workspace on comfortable graphite surfaces with clear financial hierarchy.
colors:
  canvas: "#0F1115"
  panel: "#16191F"
  elevated: "#1E222A"
  line: "#2C313B"
  muted: "#98A0AE"
  ink: "#E6EAF0"
  accent: "#3ECF8E"
  accent-ink: "#061A11"
  aqua: "#6AA8FF"
  violet: "#A791FA"
  amber: "#ECB252"
  danger: "#F07A8C"
  teal: "#54CCC4"
typography:
  sans:
    fontFamily: "Inter Variable (self-hosted via @fontsource-variable/inter), ui-sans-serif, system-ui, sans-serif"
rounded:
  lg: "0.625rem"
  xl: "0.875rem"
spacing:
  section-gap: "1.5rem"
  page-max: "80rem"
components:
  button: {}
  card: {}
  dialog: {}
---

# Invest Hub Design System

## Overview

### Creative North Star
A personal financial ledger read in the evening: graphite (never pure black) surfaces, softened contrast, generous spacing, legible figures, and restrained green accents.

### Product context and register
Personal investment tracking, based on README.md and the existing client. Product/Operate register. Portuguese interface and BRL formatting; Brazilian financial instruments are present. Desktop and narrow-screen use. Preserve the incumbent identity rather than replacing it. Financial data, actions and recovery take priority over decoration. Avoid marketing claims and decorative hero treatments.

Runtime ownership: `apps/client/src/theme/app-theme.ts` is canonical for both palettes. It writes `--color-*`; `apps/client/tailwind.config.ts` maps them to semantic utilities. This document mirrors dark defaults, not a separate generated theme. Shared global behavior lives in `apps/client/src/styles/globals.css`.

## Colors
Canvas, panel and elevated surfaces separate layers. Ink and muted describe text hierarchy. Accent identifies primary actions; text on accent or rose fills uses `accent-ink` (dark in dark mode, white in light mode). Rose identifies errors and destructive actions, always with a label. Light/system modes use the runtime light palette. Selected navigation uses the elevated fill, weight, an accent icon and aria-current, not color alone. Shadow strength is set per theme through `--shadow-near` / `--shadow-far`.

### Charts
Charts never hardcode colors. `components/charts/chart-theme.tsx` resolves theme tokens (`accent`, `aqua`, `violet`, `amber`, `rose`, `teal`, `muted`) to concrete colors and re-renders on `invest-hub:theme-change`; legacy server category colors (#22c55e, #38bdf8, …) map onto these tokens. Axes and grid are themed in globals.css. Tooltips are theme-classed cards with full currency values. Multi-series charts show a legend; reference series (e.g. invested capital) are dashed, the primary series gets a soft area fill. Donuts show the total in the center and a legend with current and target share.

## Typography
Inter Variable for everything (open digits, single-storey a). Fixed rem scale: page titles 1.75rem, card values 1.5rem (sized to the card through container queries), body 0.875–0.9375rem. Card currency symbols render smaller and muted so the amount reads first. Financial values use tabular numerals. No eyebrow/kicker labels above headings. Sentence case in new copy; explicit action labels. Never imply data freshness or connectivity without response evidence.

## Layout
Desktop navigation is 16rem wide from 1024px; below that use the modal drawer. Main content is capped at 80rem except the existing wide portfolio view. Controls have a 44px minimum height. Dashboard prioritizes four metrics; supplementary metrics remain in a native disclosure.

## Elevation & Depth
Panels keep a 1px line border plus the soft two-layer shadow. Dialogs use a deeper offset shadow over a plain dimmed backdrop (no blur). No decorative glows or gradient backgrounds. Dialog content scrolls within the viewport.

## Shapes
10px controls (`rounded-lg`), 14px panels and cards (`rounded-xl`); consistent Lucide icons. Lists inside cards use dividers, not nested cards.

## Components
Buttons expose visible focus, actionable labels and busy/disabled state. AppLayout owns navigation, skip link and quotation refresh feedback. ManagementToolbar owns local search clearing and focus restoration. ManagementModal and ConfirmDelete share useDialogFocus with the drawer. ConfirmDelete starts on Cancel. Escape closes overlays; Tab remains inside; closing restores the trigger. Respect reduced motion.

## Verification
Run client typecheck, tests and build. `scripts/ux-browser-check.cjs` uses isolated mocked API responses for targeted browser checks; it does not verify live backend correctness. Preserve existing form validation until individual flows are migrated with equivalent app-owned error handling.
