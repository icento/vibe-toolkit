---
name: vibe-schema
description: Design or update the data model as structured *.schema.json files that compile to ER diagrams for review. Use when a request adds or changes entities, fields, relations, or storage — before writing migrations or model code.
model: fable
---

# Design or update a data schema

1. **Locate.** Schemas live at `docs/architecture/data/<domain>.schema.json`, one
   file per domain. Check the Data section of `docs/architecture/INDEX.md` — extend
   the domain that owns these entities rather than opening a near-duplicate file.
   Read `docs/architecture/data/README.md` for the full format before your first edit.
2. **New domain:** copy `docs/architecture/_templates/data.schema.json`. Declare the
   `database` it lives in and that database's `engine` (must match other files using
   the same database name). A brand-new database or engine choice is an ADR
   (`/vibe-adr`) first; the schema records the outcome.
3. **Model honestly.** Engine-native types, a `pk` on every entity, `ref` for every
   foreign key (it becomes a diagram edge), `relations` only for what refs can't say
   (many-to-many, embedding). `summary` on entities and non-obvious fields — the
   generated doc is only as reviewable as these lines. Refs may point at entities in
   other files of the same database, never across databases.
4. **Generate & review.** `node scripts/arch-docs.mjs check` validates the model
   (shape, ref integrity, engine consistency) and regenerates `data/index.html` —
   the interactive relationship diagram of the whole model (filter, click-to-focus
   a table and its neighbors). **Never edit it; the JSON is the only hand-edited
   file in data/.** Have the user open it in a browser: schema-first review is the
   cheapest point to catch a wrong data model, before migrations exist.
5. **Lifecycle.** `status: draft` until the schema exists in storage, then
   `current`. When implementing, migrations/model code and the schema update ship
   in the same change — if code reveals the schema was wrong, fixing the JSON is
   part of the fix.
