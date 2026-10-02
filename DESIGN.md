---
version: alpha
name: Invest Hub
description: Personal investment workspace with quiet surfaces and clear financial hierarchy.
colors:
  canvas: "#070809"
  panel: "#0D0F10"
  elevated: "#141617"
  line: "#232728"
  muted: "#8B9491"
  ink: "#F4F7F5"
  accent: "#22C55E"
  danger: "#FB7185"
typography:
  sans:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
rounded:
  DEFAULT: "0.5rem"
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
A personal financial ledger: stable alignment, legible figures, and restrained green accents.

### Product context and register
Personal investment tracking, based on README.md and the existing client. Product/Operate register. Portuguese interface and BRL formatting; Brazilian financial instruments are present. Desktop and narrow-screen use. Preserve the incumbent identity rather than replacing it. Financial data, actions and recovery take priority over decoration. Avoid marketing claims and decorative hero treatments.

Runtime ownership: `apps/client/src/theme/app-theme.ts` is canonical for both palettes. It writes `--color-*`; `apps/client/tailwind.config.ts` maps them to semantic utilities. This document mirrors dark defaults, not a separate generated theme. Shared global behavior lives in `apps/client/src/styles/globals.css`.

## Colors
Canvas, panel and elevated surfaces separate layers. Ink and muted describe text hierarchy. Accent identifies primary actions; rose identifies errors and destructive actions, always with a label. Light/system modes use the existing runtime palette. Selected navigation also uses weight and aria-current, not color alone.

## Typography
Preserve the existing sans stack and type scale. Financial values use tabular numerals. Sentence case in new copy; explicit action labels. Never imply data freshness or connectivity without response evidence.

## Layout
Desktop navigation is 16rem wide from 1024px; below that use the modal drawer. Main content is capped at 80rem except the existing wide portfolio view. Controls have a 44px minimum height. Dashboard prioritizes four metrics; supplementary metrics remain in a native disclosure.

## Elevation & Depth
Preserve panel borders and established overlay depth. Do not introduce new decorative effects. Dialog content scrolls within the viewport.

## Shapes
Existing 8px controls and panels; consistent Lucide icons.

## Components
Buttons expose visible focus, actionable labels and busy/disabled state. AppLayout owns navigation, skip link and quotation refresh feedback. ManagementToolbar owns local search clearing and focus restoration. ManagementModal and ConfirmDelete share useDialogFocus with the drawer. ConfirmDelete starts on Cancel. Escape closes overlays; Tab remains inside; closing restores the trigger. Respect reduced motion.

## Verification
Run client typecheck, tests and build. `scripts/ux-browser-check.cjs` uses isolated mocked API responses for targeted browser checks; it does not verify live backend correctness. Preserve existing form validation until individual flows are migrated with equivalent app-owned error handling.
