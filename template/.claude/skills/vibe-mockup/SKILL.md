---
name: vibe-mockup
description: Create static HTML/CSS mockups for a request's UI, consistent with the shared design system. Use during the designing phase whenever a request involves UI/UX.
---

# Mockups

1. **Design system first.** Every visual decision comes from
   `design-system/tokens.css` — its tokens and component classes (`.btn`, `.input`,
   `.card`, `.badge`, `.table`…). If a screen needs a component or token that
   doesn't exist, add it to `tokens.css` and show it in
   `design-system/components.html` *first*, then use it. Never hardcode a color,
   font size, spacing, or **layout size** (page max-width, field/column widths)
   inside a mockup — layout geometry is a token too (`--size-page-max`,
   `--size-field`). This is what keeps every screen — and every future frontend —
   consistent.
2. **Layout.** `mockups/<NNNN-slug>/` with an `index.html` linking every screen;
   one HTML file per screen; each imports `../../design-system/tokens.css`.
   Static HTML/CSS only — no frameworks, no build step (a few inline-JS lines for
   a tab or menu toggle are fine).
3. **Parallelize.** One subagent per screen. Each prompt includes: the screen's
   purpose from `understanding.md`, the paths to `tokens.css` and
   `components.html`, and rule 1 verbatim. Consistency comes from shared tokens,
   not shared context.
4. **Realistic content.** Production-looking copy, names, and data — never lorem
   ipsum, never "Item 1/2/3". The user judges "finished product" feel at the
   alignment gate, and placeholder content sabotages that judgment.
5. **Consistency pass.** Before showing the user, review all screens together:
   spacing rhythm, type scale, palette use, component reuse. Then record
   `mockups/<NNNN-slug>/` in the request's `outcome:` list.
