---
name: vibe-mockup
description: Create or update the living HTML/CSS mockups of a frontend (one folder per frontend under mockups/), consistent with the shared design system. Use during the designing phase whenever a request involves UI/UX — including A/B comparison of competing style directions.
model: fable
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
   consistent, and lint enforces it: `node scripts/arch-docs.mjs check` fails on
   hardcoded colors or px/rem sizes in any mockup screen.
2. **UX rules.** Every screen follows `docs/architecture/ui-principles.md`:
   data-driven screens show their loading, empty, and error states (mock at least
   the empty and error variants where they matter); forms are single-column with
   permanently visible labels; color is never the only signal. If a screen needs
   to break a rule, say so at the alignment gate — never break it silently.
3. **Living mockups, one folder per frontend.** `mockups/<frontend>/` mirrors that
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
4. **A/B variants when the user wants to compare styles.** Variants live in
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
5. **Parallelize.** One subagent per screen — and per variant. Each prompt
   includes: the screen's purpose from `understanding.md`, the paths to
   `tokens.css`, `components.html`, and `docs/architecture/ui-principles.md`,
   and rule 1 verbatim. Consistency comes from shared tokens, not shared context.
6. **Realistic content.** Production-looking copy, names, and data — never lorem
   ipsum, never "Item 1/2/3". The user judges "finished product" feel at the
   alignment gate, and placeholder content sabotages that judgment. Variants
   being compared use the *same* content — only the style may differ, or the
   user ends up judging the copy, not the direction.
7. **Consistency pass.** Before showing the user, review the changed screens
   against the rest of their frontend folder: spacing rhythm, type scale, palette
   use, component reuse — plus the ui-principles checklist (states present,
   contrast, labels, hierarchy restraint). Then record each added or changed
   screen path (e.g. `mockups/admin/billing.html`) in the request's
   `outcome:` list.
