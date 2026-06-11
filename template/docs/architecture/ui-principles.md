---
title: UI/UX principles
summary: Default, testable UI/UX rules — the WCAG 2.2 AA floor plus durable usability heuristics — for every screen, mockup, and frontend in this repository.
status: current
date: 2026-06-11
affects: ["design-system/**", "mockups/**"]
tags: [process, ui]
---

<!-- Defaults distilled from WCAG 2.2 (https://www.w3.org/TR/WCAG22/) and Nielsen
     Norman Group research — the guidance that survives scrutiny year after year;
     visual fashion does not. Edit to fit this project, and add this project's
     frontend source globs to `affects:` above (e.g. "src/components/**") so the
     doc is recalled for UI code, not just mockups. Reversing a rule gets an ADR. -->

## Accessibility floor (WCAG 2.2 AA — mechanical pass/fail)

- **Contrast is checkable, so check it.** Text ≥ 4.5:1 against its background (≥ 3:1 for large text); borders, icons, and state cues that identify a control ≥ 3:1 against adjacent colors. Token pairs in `tokens.css` must satisfy this — verify any new pair before merge.
- **Never color alone.** Every color-coded meaning (error, status, selection) gets a redundant cue — text, icon, or weight. A red border by itself is not an error state.
- **Pointer targets ≥ 24×24 CSS px** — prefer 40px+ for primary controls. Exceptions: links inline in text, and undersized targets with enough clear spacing.
- **Keyboard covers everything.** Every action reachable by keyboard, in a sensible order, with a visible focus indicator that sticky headers/footers never fully hide.
- **Respect `prefers-reduced-motion`** — non-essential animation and transitions collapse to instant under it (`tokens.css` does this globally).

## Every view ships its three extra states

- **Loading by wait time:** under ~1s, no indicator; 1–10s, spinner or skeleton; over 10s, a determinate progress bar. Every async action gives immediate feedback.
- **Empty states explain and act.** Say why the area is empty and give a direct action to populate it (a no-results state instead guides adjusting search/filters). A bare blank region is a bug.
- **Errors are adjacent, plain, and constructive.** Next to the field or action that caused them, in plain language, naming the precise problem and a remedy. "An error occurred" fails on all three counts. (Security exception: login-style failures may stay vague.)

## Forms

- **Single column.** Only 2–3 short, tightly related fields (city / state / ZIP) may share a row.
- **Labels and help text stay permanently visible** outside the input — placeholder text is never the label.
- **Validate on blur or submit, never mid-typing.** (Exception: live requirement checklists, e.g. password rules.)
- **Never ask twice.** Information already entered in the same flow is pre-filled or selectable, not re-typed.

## Hierarchy & consistency

- **Hierarchy through restraint:** per view, at most ~3 type sizes, ~3 contrast levels, and 2 large elements. Emphasis comes from value/saturation contrast, not from introducing new hues.
- **Same name, same thing.** A word, icon, or action never changes meaning between screens; follow platform conventions over inventing new patterns.
- **Every visual value is a token.** Colors, type sizes, spacing, and layout geometry come from `design-system/tokens.css`; a hardcoded value in a screen is a defect even when it looks right.
