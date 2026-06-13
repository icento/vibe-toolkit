---
name: vibe-mockup
description: Create or update the living HTML/CSS mockups of a frontend (one folder per frontend under mockups/), consistent with the shared design system. Use during the designing phase whenever a request involves UI/UX — including A/B comparison of competing style directions.
model: opus
---

# Mockups

1. **Direction before screens.** `tokens.css` ships as a neutral starter — a
   placeholder, not a design (its header notice marks this). While that notice
   is still present, commit to an aesthetic direction with the user before
   mocking any screen: open `design-system/themes/index.html` (the preset
   directions rendered live on the component gallery) and have them pick one or
   describe their own — tone words, type pairing, palette character, and the
   one thing a user of this product should remember. Fold the winner into
   `tokens.css` itself (replace the starter values, keep the WCAG pair
   comments, verify every new pair) and delete the starter notice; presets in
   `themes/` stay for future re-theming. Record the chosen direction and why in
   the request record. Never ship real screens on the unmodified starter, and
   never default to another product's or vendor's brand look — the direction
   must be chosen for *this* product.
   The same gate fixes the **component track**. Default: the hand-rolled
   component classes in `tokens.css` (zero-dependency). Opt-in, when the user
   wants a full shadcn-grade component set: **Basecoat** (MIT, plain-HTML
   shadcn port, no build step) — vendor the self-contained CDN build into
   `design-system/vendor/basecoat.min.css` (pin a version:
   `https://cdn.jsdelivr.net/npm/basecoat-css@0.3.11/dist/basecoat.cdn.min.css`),
   delete the component classes from `tokens.css` (Basecoat provides them;
   tokens, base styles, and chart classes stay), and have every screen import,
   in order: `vendor/basecoat.min.css`, `tokens.css`,
   `design-system/shadcn-bridge.css` — the bridge forwards tokens into
   Basecoat's shadcn variables and must come last to beat Basecoat's built-in
   zinc defaults (a vendor look; never ship it unthemed). Basecoat components
   that need JS (dropdown, select, tabs, toast…) are mocked in a static open
   state. Record the track choice in the request record.
2. **Design system first.** Every visual decision comes from
   `design-system/tokens.css` — its tokens and component classes (`.btn`, `.input`,
   `.card`, `.badge`, `.table`…). If a screen needs a component or token that
   doesn't exist, add it to `tokens.css` and show it in
   `design-system/components.html` *first*, then use it. Never hardcode a color,
   font size, spacing, or **layout size** (page max-width, field/column widths)
   inside a mockup — layout geometry is a token too (`--size-page-max`,
   `--size-field`). This is what keeps every screen — and every future frontend —
   consistent, and lint enforces it: `node scripts/arch-docs.mjs check` fails on
   hardcoded colors or px/rem sizes in any mockup screen. The rare exception is a
   value that *cannot* be a token because it is fixed by a third party — a brand
   mark (the Microsoft logo squares, a Google sign-in button), an embedded vendor
   SVG. Never theme those; mark them so lint passes:
   `<!-- arch-docs:allow Microsoft brand mark -->` exempts that line, and
   `<!-- arch-docs:allow-start --> … <!-- arch-docs:allow-end -->` exempts a block.
3. **UX rules.** Every screen follows `docs/architecture/ui-principles.md`:
   data-driven screens show their loading, empty, and error states (mock at least
   the empty and error variants where they matter); forms are single-column with
   permanently visible labels; color is never the only signal. If a screen needs
   to break a rule, say so at the alignment gate — never break it silently.
4. **Living mockups, one folder per frontend.** `mockups/<frontend>/` mirrors that
   frontend's current UI (`mockups/web-app/`, `mockups/admin/`…); a single-frontend
   project still names its one folder. Like design docs, mockups develop
   continuously: a request edits screens in place or adds new ones — never a
   per-request copy; git history is the archive. Each frontend folder keeps an
   `index.html` *board*: every screen — including its empty/error state files —
   rendered live as a scaled iframe tile (styled by `../../design-system/board.css`,
   stretched-link tile pattern, S/M/L zoom buttons), so the whole frontend is
   judged at a glance and a missing state is visible immediately. One HTML file
   per screen; each imports `../../design-system/tokens.css`. Static HTML/CSS
   only — no frameworks, no build step (a few inline-JS lines for a tab, menu,
   or the board's zoom are fine; `index.html` is board chrome, exempt from the
   token lint).
5. **A/B variants when the user wants to compare styles.** Variants live in
   `mockups/<frontend>/_variants/` as `<screen>--<variant>.html`
   (`dashboard--compact.html`, `dashboard--airy.html`), each a full screen
   following every rule here, plus a `_variants/index.html` board (same
   `board.css`) showing the contenders side by side with a one-line rationale
   per direction.
   A variant needing different visual values overrides tokens in its own
   `<variant>.tokens.css` imported after the base — never inline. Variants are
   mortal: at the alignment gate the user picks one; the winner replaces the
   canonical screen, its token overrides fold into `tokens.css`, `_variants/`
   is deleted (git is the archive), and the choice + why is recorded in the
   request record.
6. **Parallelize.** One subagent per screen — and per variant. Each prompt
   includes: the screen's purpose from `understanding.md`, the paths to
   `tokens.css`, `components.html`, and `docs/architecture/ui-principles.md`,
   and rule 2 (design system first) verbatim. Consistency comes from shared
   tokens, not shared context.
7. **Realistic content.** Production-looking copy, names, and data — never lorem
   ipsum, never "Item 1/2/3". The user judges "finished product" feel at the
   alignment gate, and placeholder content sabotages that judgment. Variants
   being compared use the *same* content — only the style may differ, or the
   user ends up judging the copy, not the direction.
8. **Charts are pictures of charts.** Data visualizations are hand-authored
   static inline SVG — never a chart library. Geometry (viewBox, coordinates,
   bar heights, in-SVG `font-size` attributes) is unitless data, exempt from
   the token rule by construction; every fill and stroke comes from
   `--chart-1…5` / `--chart-grid` (status colors never mark a series), in-SVG
   text uses `.chart-axis`/`.chart-value`, and legends are real HTML text
   (`.chart-legend`) — color is never the only series signal. Canonical bar,
   line, and donut recipes live in `design-system/components.html`. Series
   data looks plausible (rule 7), variants compare on identical data, and a
   tooltip that matters to the design is drawn frozen-open.
9. **Consistency pass.** Before showing the user, review the changed screens
   against the rest of their frontend folder: spacing rhythm, type scale, palette
   use, component reuse — plus the ui-principles checklist (states present,
   contrast, labels, hierarchy restraint). Then record each added or changed
   screen path (e.g. `mockups/admin/billing.html`) in the request's
   `outcome:` list.
