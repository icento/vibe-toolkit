---
name: vibe-design
description: Create or update a living design doc for a component before building it. Use when starting a new component/feature, or when a change alters a component's purpose, interface, or internals.
---

# Create or update a design doc

1. **Locate.** Design docs live at `docs/architecture/designs/<domain>/<component>.md`.
   Check `docs/architecture/INDEX.md` for an existing doc covering this component —
   update it rather than creating a near-duplicate.
2. **New doc:** copy `docs/architecture/_templates/design.md`. Keep it small — purpose,
   interface, one mermaid diagram of internals, dependencies, and links to the ADRs
   that shaped it. Five honest lines beat five speculative sections.
   - `affects`: the code path globs this design covers — this is how agents find it later.
   - `status`: `draft` until the component exists in code, then `current`.
3. **Existing doc:** edit it to describe the system *as it will be after this change*.
   Bump `date`. History and rationale go in ADRs, not here — if you are reversing a
   past decision, invoke `/vibe-adr` instead of rewriting this doc's story.
4. **Design-first flow:** when the user asks to build something new, write this doc
   *before* the code and show it to the user — it is the cheapest review point.
5. **Check:** `node scripts/arch-docs.mjs check` must pass (regenerates the
   index, then lints).
