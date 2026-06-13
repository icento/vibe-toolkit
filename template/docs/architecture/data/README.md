# Data schemas

The data model lives here as structured files — `<domain>.schema.json`, one per
domain — not prose. `node scripts/arch-docs.mjs check` compiles the whole model
into `index.html`: a self-contained, interactive relationship diagram of every
entity across all databases (type to filter tables/fields, click a table to focus
on it and its neighbors, hover to trace edges). Open it in a browser to review.
It is generated — **never edit it by hand**, edit the JSON. Lint validates shape
and referential integrity, so a schema that passes `check` is internally
consistent. No other files belong in this directory.

Start from `../_templates/data.schema.json`.

## File format

```jsonc
{
  "title": "Identity",                  // for the index
  "summary": "Users, teams, membership",
  "status": "draft",                    // draft | current | archived — draft until it exists in storage
  "date": "2026-01-31",
  "affects": ["src/identity/**"],       // code path globs — how agents recall this doc
  "database": "main",                   // logical database this domain lives in
  "engine": "postgres",                 // its technology: postgres, mysql, sqlite, mongodb, dynamodb, redis, ...
  "entities": {
    "users": {                          // table / collection / key pattern
      "summary": "A person who can sign in",
      "fields": {
        "id":      { "type": "uuid", "pk": true },
        "email":   { "type": "citext", "unique": true },
        "team_id": { "type": "uuid", "ref": "teams.id", "nullable": true,
                     "summary": "null until onboarding completes" }
      }
    }
  },
  "relations": [                        // only what refs can't express (M2M, embedding)
    { "from": "users", "to": "roles", "cardinality": "many-to-many", "via": "user_roles", "label": "has" }
  ]
}
```

- **Fields**: `type` (required; engine-native types welcome — `varchar(255)`,
  `jsonb`, `S`/`N` for DynamoDB), `pk`, `unique`, `nullable` (booleans), `ref`
  ("entity.field" — renders as an FK edge, dashed when nullable), `summary`.
  Every entity needs at least one `pk` field — its identity (document `_id`,
  Redis key, …).
- **Relations**: `cardinality` is `one-to-one` | `one-to-many` | `many-to-many`
  (read `from` → `to`); `via` names an unmodeled join table; `label` is the verb
  on the diagram edge. A plain foreign key needs no relation entry — `ref` covers it.
- Unknown keys are lint errors — they are how typos hide in structured files.

## Growing the model

- One file per domain. Split when a file stops fitting one review; entity names
  stay unique per database, and `ref` resolves across files within a database —
  referenced entities from other files appear in the diagram automatically.
- **Multi-database**: each file declares its `database` + `engine`; the same
  database name must keep the same engine everywhere. `ref` never crosses
  databases — a cross-database link is an integration, not a foreign key:
  document it in `views/containers.md` or the owning design doc.
- Choosing or changing an engine is an ADR (`/vibe-adr`); the schema records the
  result. Migrations/model code ship in the same change as the schema update.
