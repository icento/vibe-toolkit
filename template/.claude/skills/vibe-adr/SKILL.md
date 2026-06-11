---
name: vibe-adr
description: Create an Architecture Decision Record. Use when a structural or technology decision is made, reversed, or needs to be proposed — including when a request conflicts with an existing accepted ADR.
model: fable
---

# Create an ADR

1. **Number it.** List `docs/architecture/adr/` and take the next sequential number
   (zero-padded to 4 digits). The id is `ADR-NNNN`, the filename `NNNN-<kebab-slug>.md`.
2. **Gather the substance.** From the conversation (ask only if genuinely missing):
   the problem/forces (Context), the choice (Decision), rejected options and why
   (Alternatives), and what gets easier/harder (Consequences).
3. **Fill the template** at `docs/architecture/_templates/adr.md`. Frontmatter:
   - `status`: `accepted` if the user has already decided; `proposed` if you are recommending.
   - `date`: today.
   - `affects`: glob paths of the code this decision governs (e.g. `services/api/**`).
   - `supersedes`: ids of any ADRs this replaces.
4. **Handle supersession.** For each ADR listed in `supersedes`, edit that file's
   frontmatter `status` to `superseded`. Do not change its body.
5. **Update related design docs** in `docs/architecture/designs/` so they describe the
   new current state.
6. **Check:** `node scripts/arch-docs.mjs check` must pass (regenerates the
   index, then lints).
7. **Report** the new id, status, and what it supersedes, in one or two sentences.
