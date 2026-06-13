#!/usr/bin/env node
// arch-docs.mjs — lint and index docs/architecture. Zero dependencies.
//
//   node scripts/arch-docs.mjs check   regenerate the index, then validate — the everyday command
//   node scripts/arch-docs.mjs lint    validate only (CI: a stale committed index fails here)
//   node scripts/arch-docs.mjs index   regenerate docs/architecture/INDEX.md
//
// Override the docs root with ARCH_DOCS_DIR (default: docs/architecture).
//
// check/lint also scan mockups/ (override: MOCKUPS_DIR) screen files for
// hardcoded colors and lengths that bypass design-system/tokens.css, and compile
// data/*.schema.json (the structured data model) into data/index.html — an
// interactive relationship diagram — validating refs across files as they go.

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative, sep } from "node:path";

const ROOT = process.env.ARCH_DOCS_DIR ?? "docs/architecture";
const INDEX_PATH = join(ROOT, "INDEX.md");
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const STATUSES = {
  adr: ["proposed", "accepted", "superseded", "deprecated"],
  design: ["draft", "current", "archived"],
  view: ["draft", "current", "archived"],
  principles: ["draft", "current", "archived"],
  request: ["open", "in-progress", "done", "deferred", "declined"],
};
const PHASES = ["understanding", "designing", "aligning", "planning", "implementing", "qa", "delivered"];
const SIZES = ["S", "M", "L"];
const GATES = ["understanding", "design"];

// ---------- collection ----------

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir).sort()) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (name !== "_templates") out.push(...walk(path));
    } else if (name.endsWith(".md") && name !== "INDEX.md" && name !== "README.md") {
      out.push(path);
    }
  }
  return out;
}

function docType(relPath) {
  const parts = relPath.split(sep);
  if (parts[0] === "adr") return "adr";
  if (parts[0] === "designs") return "design";
  if (parts[0] === "views") return "view";
  // In a request dir only request.md is the indexed record; understanding.md,
  // plan.md, qa-report.md are free-form phase artifacts.
  if (parts[0] === "requests") return parts[parts.length - 1] === "request.md" ? "request" : "ignore";
  // data/*.md are generated from *.schema.json — validated by the data pipeline,
  // not as frontmatter docs (orphans without a schema sibling fail there).
  if (parts[0] === "data") return "ignore";
  if (relPath === "principles.md" || relPath === "style.md" || relPath === "ui-principles.md") return "principles";
  return null;
}

// ---------- frontmatter (minimal YAML subset: scalars, [flow]/dashed lists, one-level maps) ----------

function unquote(s) {
  return s.replace(/^["'](.*)["']$/, "$1");
}

// Flow sequences may wrap across lines ("affects:\n  [\n    'a', 'b',\n  ]") —
// rejoin them onto the line that opened them so the parser stays line-based.
function joinFlowSequences(lines) {
  const depthOf = (s) => (s.match(/\[/g) ?? []).length - (s.match(/\]/g) ?? []).length;
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    let depth = depthOf(line);
    while (depth > 0 && i + 1 < lines.length) {
      i += 1;
      line = `${line} ${lines[i].trim()}`;
      depth += depthOf(lines[i]);
    }
    if (/^\s*\[/.test(line) && out.length && /:\s*$/.test(out[out.length - 1])) {
      out[out.length - 1] += ` ${line.trim()}`; // bracket opened on the line after "key:"
    } else {
      out.push(line);
    }
  }
  return out;
}

function parseFrontmatter(text) {
  if (!text.startsWith("---\n")) return { error: "missing frontmatter block" };
  const end = text.indexOf("\n---", 4);
  if (end === -1) return { error: "unterminated frontmatter block" };
  const data = {};
  let openKey = null; // key whose indented children we are collecting
  for (const line of joinFlowSequences(text.slice(4, end).split("\n"))) {
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const item = line.match(/^\s+-\s+(.*)$/);
    if (item && openKey) {
      if (!Array.isArray(data[openKey])) return { error: `"${openKey}" mixes list items and map entries` };
      data[openKey].push(unquote(item[1].trim()));
      continue;
    }
    const nested = line.match(/^\s+([A-Za-z][\w-]*):\s*(.*)$/);
    if (nested && openKey) {
      if (Array.isArray(data[openKey])) {
        if (data[openKey].length) return { error: `"${openKey}" mixes list items and map entries` };
        data[openKey] = {};
      }
      data[openKey][nested[1]] = unquote(nested[2].trim());
      continue;
    }
    const kv = line.match(/^([A-Za-z][\w-]*):\s*(.*)$/);
    if (!kv) return { error: `unparseable frontmatter line: "${line}"` };
    const [, key, rest] = kv;
    if (rest === "") {
      data[key] = []; // empty list by default; converted to a map if children are k: v
      openKey = key;
    } else if (rest.startsWith("[")) {
      const inner = rest.replace(/^\[/, "").replace(/\]\s*$/, "").trim();
      data[key] = inner.split(",").map((s) => unquote(s.trim())).filter((s) => s !== "");
      openKey = null;
    } else {
      data[key] = unquote(rest.trim());
      openKey = null;
    }
  }
  return { data };
}

// ---------- validation ----------

function loadDocs(errors) {
  const docs = [];
  for (const path of walk(ROOT)) {
    const rel = relative(ROOT, path);
    const type = docType(rel);
    if (type === "ignore") continue;
    if (!type) {
      errors.push(`${path}: unexpected location — docs live in adr/, designs/, views/, requests/, data/, principles.md, style.md, or ui-principles.md`);
      continue;
    }
    const { data, error } = parseFrontmatter(readFileSync(path, "utf8"));
    if (error) {
      errors.push(`${path}: ${error}`);
      continue;
    }
    docs.push({ path, rel, type, fm: data });
  }
  return docs;
}

function approvalsOf(fm, path, errors) {
  const a = fm.approvals;
  if (a === undefined || (Array.isArray(a) && a.length === 0)) return {};
  if (Array.isArray(a)) {
    errors.push(`${path}: "approvals" must be a map of gate: YYYY-MM-DD`);
    return {};
  }
  for (const [gate, date] of Object.entries(a)) {
    if (!GATES.includes(gate)) errors.push(`${path}: unknown approval gate "${gate}" (expected: ${GATES.join(", ")})`);
    if (!DATE_RE.test(date)) errors.push(`${path}: approvals.${gate} must be YYYY-MM-DD, got "${date}"`);
  }
  return a;
}

function validateRequest({ path, rel, fm }, ids, errors) {
  if (!/^REQ-\d{4}$/.test(fm.id ?? "")) {
    errors.push(`${path}: requests need id matching REQ-NNNN, got "${fm.id}"`);
  } else {
    const dir = rel.split(sep)[1] ?? "";
    if (!dir.startsWith(`${fm.id.slice(4)}-`)) {
      errors.push(`${path}: request directory must be named "${fm.id.slice(4)}-<slug>" to match ${fm.id}`);
    }
    if (ids.has(fm.id)) errors.push(`${path}: duplicate id ${fm.id} (also in ${ids.get(fm.id)})`);
    ids.set(fm.id, path);
  }
  for (const field of ["phase", "size", "updated"]) {
    if (!fm[field] || typeof fm[field] !== "string") errors.push(`${path}: missing required field "${field}"`);
  }
  if (fm.updated && !DATE_RE.test(fm.updated)) errors.push(`${path}: updated must be YYYY-MM-DD, got "${fm.updated}"`);
  if (fm.phase && !PHASES.includes(fm.phase)) errors.push(`${path}: phase "${fm.phase}" not in [${PHASES.join(", ")}]`);
  if (fm.size && !SIZES.includes(fm.size)) errors.push(`${path}: size "${fm.size}" not in [${SIZES.join(", ")}]`);
  if (fm.outcome !== undefined && !Array.isArray(fm.outcome)) errors.push(`${path}: "outcome" must be a list`);

  const approvals = approvalsOf(fm, path, errors);
  const phaseIdx = PHASES.indexOf(fm.phase);
  const parked = ["deferred", "declined"].includes(fm.status);

  // Gates. Lint makes skipping an alignment gate a structural error, not a judgment call.
  if (!parked && phaseIdx >= 0) {
    if (fm.size === "L" && phaseIdx >= PHASES.indexOf("designing") && !approvals.understanding) {
      errors.push(`${path}: gate G1 — phase "${fm.phase}" (size L) requires approvals.understanding`);
    }
    if (["L", "M"].includes(fm.size) && phaseIdx >= PHASES.indexOf("implementing") && !approvals.design) {
      errors.push(`${path}: gate G2 — phase "${fm.phase}" (size ${fm.size}) requires approvals.design`);
    }
  }
  if (!parked) {
    if (fm.phase === "delivered" && fm.status !== "done") errors.push(`${path}: phase "delivered" requires status "done"`);
    if (fm.status === "done" && fm.phase !== "delivered") errors.push(`${path}: status "done" requires phase "delivered"`);
  }
}

function validate(docs, errors) {
  const ids = new Map();
  for (const doc of docs) {
    const { path, rel, type, fm } = doc;
    for (const field of ["title", "summary", "status", "date"]) {
      if (!fm[field] || typeof fm[field] !== "string") errors.push(`${path}: missing required field "${field}"`);
    }
    if (fm.date && !DATE_RE.test(fm.date)) errors.push(`${path}: date must be YYYY-MM-DD, got "${fm.date}"`);
    if (fm.status && typeof fm.status === "string" && !STATUSES[type].includes(fm.status)) {
      errors.push(`${path}: status "${fm.status}" not in [${STATUSES[type].join(", ")}] for ${type} docs`);
    }
    if (type === "adr") {
      if (!/^ADR-\d{4}$/.test(fm.id ?? "")) {
        errors.push(`${path}: ADRs need id matching ADR-NNNN, got "${fm.id}"`);
      } else {
        const num = fm.id.slice(4);
        if (!rel.startsWith(join("adr", num))) errors.push(`${path}: filename must start with "${num}-" to match ${fm.id}`);
        if (ids.has(fm.id)) errors.push(`${path}: duplicate id ${fm.id} (also in ${ids.get(fm.id)})`);
        ids.set(fm.id, path);
      }
      if (!Array.isArray(fm.affects)) errors.push(`${path}: "affects" must be a list of code path globs`);
      if (fm.supersedes !== undefined && !Array.isArray(fm.supersedes)) errors.push(`${path}: "supersedes" must be a list`);
    }
    if (type === "design" && !Array.isArray(fm.affects)) {
      errors.push(`${path}: design docs need "affects" — the code path globs this design covers`);
    }
    if (type === "request") validateRequest(doc, ids, errors);
  }

  // Supersession must be consistent in both directions.
  const byId = new Map(docs.filter((d) => d.fm.id).map((d) => [d.fm.id, d]));
  for (const { path, fm, type } of docs) {
    if (type !== "adr") continue;
    for (const target of fm.supersedes ?? []) {
      const old = byId.get(target);
      if (!old) errors.push(`${path}: supersedes ${target}, which does not exist`);
      else if (!["superseded", "deprecated"].includes(old.fm.status)) {
        errors.push(`${old.path}: status must be "superseded" — it is superseded by ${fm.id}`);
      }
    }
  }

  // Outcome links must resolve: ADR ids to existing ADRs, in-tree paths to files.
  // Anything else (mockups/…, "#123", URLs) is an external reference, left unchecked.
  for (const { path, fm } of docs) {
    for (const ref of Array.isArray(fm.outcome) ? fm.outcome : []) {
      if (/^ADR-\d{4}$/.test(ref)) {
        if (!byId.has(ref)) errors.push(`${path}: outcome references ${ref}, which does not exist`);
      } else if (/^(adr|designs|views|data)\//.test(ref)) {
        if (!existsSync(join(ROOT, ref))) errors.push(`${path}: outcome references missing file ${ref}`);
      }
    }
  }
}

// ---------- mockup lint ----------
// Mockup screens take every visual value from design-system/tokens.css; anything
// that looks like a hardcoded color or length is an error. index.html files are
// board/navigation chrome (see design-system/board.css) and are exempt.
//
// Escape hatch for values that are intentionally fixed and cannot be tokens —
// third-party brand marks (the Microsoft logo squares, a Google sign-in button),
// embedded vendor SVGs — mark them so the lint passes without weakening the rule
// elsewhere. Put the marker in a comment so it doesn't render:
//   <div style="background:#F25022">  <!-- arch-docs:allow Microsoft brand mark -->
// exempts that one line; wrap a block (e.g. an inline logo SVG) with
//   <!-- arch-docs:allow-start --> … <!-- arch-docs:allow-end -->.

const MOCKUPS_ROOT = process.env.MOCKUPS_DIR ?? "mockups";
// Hex not part of an HTML entity (&#8226;) or fragment link (href="#a1b2"),
// or a color function. Lengths: anything but the 0px/1px hairline values.
const COLOR_RE = /(?<!&)(?<!href=")#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?|oklch)\(/g;
const LENGTH_RE = /(?<![\w.-])\d+(?:\.\d+)?(?:px|rem|em)\b/g;
const LENGTH_OK = new Set(["0px", "1px"]);

function walkMockups(dir) {
  const out = [];
  for (const name of readdirSync(dir).sort()) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...walkMockups(path));
    else if (name.endsWith(".html") && name !== "index.html") out.push(path);
  }
  return out;
}

function lintMockups(errors) {
  if (!existsSync(MOCKUPS_ROOT)) return 0;
  const screens = walkMockups(MOCKUPS_ROOT);
  for (const path of screens) {
    const raw = readFileSync(path, "utf8").split("\n"); // for allow markers
    // Blank out HTML comments but keep line numbers stable.
    const text = readFileSync(path, "utf8")
      .replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, " "));
    let suppressed = false; // inside an arch-docs:allow-start/end block
    text.split("\n").forEach((line, i) => {
      const marker = raw[i]; // markers live in comments, blanked out of `line`
      if (/arch-docs:allow-end\b/.test(marker)) { suppressed = false; return; }
      if (/arch-docs:allow-start\b/.test(marker)) { suppressed = true; return; }
      if (suppressed || /arch-docs:allow\b/.test(marker)) return; // intentionally fixed
      for (const m of line.match(COLOR_RE) ?? []) {
        errors.push(`${path}:${i + 1}: hardcoded color "${m}" — use a var(--…) token from design-system/tokens.css (or mark it: <!-- arch-docs:allow … -->)`);
      }
      for (const m of line.match(LENGTH_RE) ?? []) {
        if (!LENGTH_OK.has(m)) {
          errors.push(`${path}:${i + 1}: hardcoded length "${m}" — sizes are tokens too (see design-system/tokens.css)`);
        }
      }
    });
  }
  return screens.length;
}

// ---------- data schemas ----------
// The data model is structured, not prose: docs/architecture/data/*.schema.json,
// one file per domain, each declaring the database it lives in. Lint validates
// shape (unknown keys are errors — they are how typos hide), referential
// integrity (refs resolve across files within one database, never across one),
// and engine consistency (one engine per database name). The whole model
// compiles to data/index.html — the review artifact; it is generated, never
// hand-edited, and lint fails when stale.

const DATA_ROOT = join(ROOT, "data");
const IDENT_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
const REF_RE = /^([A-Za-z_][A-Za-z0-9_]*)\.([A-Za-z_][A-Za-z0-9_]*)$/;
const CARDINALITY = { "one-to-one": "1:1", "one-to-many": "1:n", "many-to-many": "n:m" }; // enum + diagram edge label
const SCHEMA_KEYS = ["title", "summary", "status", "date", "affects", "database", "engine", "entities", "relations"];
const ENTITY_KEYS = ["summary", "fields"];
const FIELD_KEYS = ["type", "pk", "unique", "nullable", "ref", "summary"];
const RELATION_KEYS = ["from", "to", "cardinality", "label", "via"];
const SCHEMA_STATUSES = ["draft", "current", "archived"];

const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const isStr = (v) => typeof v === "string" && v.trim() !== "";

function walkData(dir) {
  const out = { schemas: [], mds: [] };
  for (const name of readdirSync(dir).sort()) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      const sub = walkData(path);
      out.schemas.push(...sub.schemas);
      out.mds.push(...sub.mds);
    } else if (name.endsWith(".schema.json")) out.schemas.push(path);
    else if (name.endsWith(".md") && name !== "README.md") out.mds.push(path);
  }
  return out;
}

function rejectUnknownKeys(obj, allowed, at, errors) {
  for (const k of Object.keys(obj)) {
    if (!allowed.includes(k)) errors.push(`${at}: unknown key "${k}" (allowed: ${allowed.join(", ")})`);
  }
}

function validateSchemaFile(path, raw, errors) {
  rejectUnknownKeys(raw, SCHEMA_KEYS, path, errors);
  for (const f of ["title", "summary", "database", "engine"]) {
    if (!isStr(raw[f])) errors.push(`${path}: missing required string "${f}"`);
  }
  if (!SCHEMA_STATUSES.includes(raw.status)) {
    errors.push(`${path}: status "${raw.status}" not in [${SCHEMA_STATUSES.join(", ")}]`);
  }
  if (!isStr(raw.date) || !DATE_RE.test(raw.date)) errors.push(`${path}: date must be YYYY-MM-DD, got "${raw.date}"`);
  if (!Array.isArray(raw.affects)) errors.push(`${path}: "affects" must be a list of code path globs`);
  if (!isObj(raw.entities) || Object.keys(raw.entities).length === 0) {
    errors.push(`${path}: "entities" must be a non-empty object keyed by entity name`);
    return false;
  }
  for (const [name, entity] of Object.entries(raw.entities)) {
    const at = `${path}: entities.${name}`;
    if (!IDENT_RE.test(name)) errors.push(`${at}: entity names must be identifiers (letters, digits, _)`);
    if (!isObj(entity)) {
      errors.push(`${at}: must be an object with "fields"`);
      return false;
    }
    rejectUnknownKeys(entity, ENTITY_KEYS, at, errors);
    if (entity.summary !== undefined && !isStr(entity.summary)) errors.push(`${at}: "summary" must be a string`);
    if (!isObj(entity.fields) || Object.keys(entity.fields).length === 0) {
      errors.push(`${at}: "fields" must be a non-empty object keyed by field name`);
      return false;
    }
    let pks = 0;
    for (const [fname, field] of Object.entries(entity.fields)) {
      const fat = `${at}.fields.${fname}`;
      if (!IDENT_RE.test(fname)) errors.push(`${fat}: field names must be identifiers (letters, digits, _)`);
      if (!isObj(field)) {
        errors.push(`${fat}: must be an object with at least "type"`);
        return false;
      }
      rejectUnknownKeys(field, FIELD_KEYS, fat, errors);
      if (!isStr(field.type)) errors.push(`${fat}: missing required string "type" (engine-native types welcome)`);
      for (const flag of ["pk", "unique", "nullable"]) {
        if (field[flag] !== undefined && typeof field[flag] !== "boolean") {
          errors.push(`${fat}: "${flag}" must be true or false`);
        }
      }
      if (field.ref !== undefined && !(isStr(field.ref) && REF_RE.test(field.ref))) {
        errors.push(`${fat}: ref must be "entity.field", got "${field.ref}"`);
      }
      if (field.summary !== undefined && !isStr(field.summary)) errors.push(`${fat}: "summary" must be a string`);
      if (field.pk === true) pks += 1;
    }
    if (pks === 0) {
      errors.push(`${at}: every entity needs at least one "pk": true field (its identity — composite keys mark each part)`);
    }
  }
  if (raw.relations !== undefined) {
    if (!Array.isArray(raw.relations)) {
      errors.push(`${path}: "relations" must be a list`);
      return false;
    }
    raw.relations.forEach((rel, i) => {
      const at = `${path}: relations[${i}]`;
      if (!isObj(rel)) {
        errors.push(`${at}: must be an object {from, to, cardinality}`);
        return;
      }
      rejectUnknownKeys(rel, RELATION_KEYS, at, errors);
      for (const f of ["from", "to"]) if (!isStr(rel[f])) errors.push(`${at}: missing required string "${f}"`);
      if (!(rel.cardinality in CARDINALITY)) {
        errors.push(`${at}: cardinality "${rel.cardinality}" not in [${Object.keys(CARDINALITY).join(", ")}]`);
      }
      for (const f of ["label", "via"]) {
        if (rel[f] !== undefined && !isStr(rel[f])) errors.push(`${at}: "${f}" must be a string`);
      }
    });
  }
  return true;
}

function loadSchemas(errors) {
  if (!existsSync(DATA_ROOT)) return { schemas: [], dbs: new Map() };
  const found = walkData(DATA_ROOT);
  const schemas = [];
  for (const path of found.schemas) {
    let raw;
    try {
      raw = JSON.parse(readFileSync(path, "utf8"));
    } catch (e) {
      errors.push(`${path}: invalid JSON — ${e.message}`);
      continue;
    }
    if (!isObj(raw)) {
      errors.push(`${path}: top level must be an object`);
      continue;
    }
    // A false return means the shape is too broken to resolve refs or generate from.
    if (validateSchemaFile(path, raw, errors)) schemas.push({ path, rel: relative(ROOT, path), raw });
  }

  // Database registry: one engine per database name, entity names unique per database.
  const dbs = new Map();
  for (const s of schemas) {
    const db = s.raw.database;
    if (!isStr(db)) continue;
    if (!dbs.has(db)) dbs.set(db, { engine: s.raw.engine, engineFrom: s.path, entities: new Map() });
    const reg = dbs.get(db);
    if (s.raw.engine !== reg.engine) {
      errors.push(`${s.path}: database "${db}" is "${reg.engine}" in ${reg.engineFrom} but "${s.raw.engine}" here — one engine per database name`);
    }
    for (const [name, entity] of Object.entries(s.raw.entities)) {
      const prev = reg.entities.get(name);
      if (prev) errors.push(`${s.path}: entity "${name}" already defined in ${prev.path} — entity names are unique per database`);
      else reg.entities.set(name, { path: s.path, rel: s.rel, fields: entity.fields });
    }
  }

  // Refs and relations resolve within the schema's own database, across files.
  for (const s of schemas) {
    const reg = dbs.get(s.raw.database);
    if (!reg) continue;
    for (const [name, entity] of Object.entries(s.raw.entities)) {
      for (const [fname, field] of Object.entries(entity.fields)) {
        const m = isStr(field.ref) ? field.ref.match(REF_RE) : null;
        if (!m) continue;
        const target = reg.entities.get(m[1]);
        if (!target) {
          errors.push(`${s.path}: entities.${name}.fields.${fname}: ref "${field.ref}" — no entity "${m[1]}" in database "${s.raw.database}" (refs never cross databases; a cross-database link is an integration, document it in views/ or a design doc)`);
        } else if (!(m[2] in target.fields)) {
          errors.push(`${s.path}: entities.${name}.fields.${fname}: ref "${field.ref}" — entity "${m[1]}" has no field "${m[2]}"`);
        }
      }
    }
    (s.raw.relations ?? []).forEach((rel, i) => {
      for (const end of ["from", "to"]) {
        if (isStr(rel[end]) && !reg.entities.has(rel[end])) {
          errors.push(`${s.path}: relations[${i}].${end}: no entity "${rel[end]}" in database "${s.raw.database}"`);
        }
      }
    });
  }

  // data/ holds schema files only (plus its README) — prose docs live in designs/.
  for (const md of found.mds) {
    errors.push(`${md}: data/ holds *.schema.json only — move prose to designs/ (the diagram lives in data/index.html)`);
  }
  return { schemas, dbs };
}

// ---------- data diagram ----------
// One generated page for the whole model: docs/architecture/data/index.html.
// Self-contained (inline CSS + script, no network, no libraries) so it renders
// from file:// anywhere. Entity cards are laid out per database with CSS; the
// inline script measures the rendered cards and draws every ref/relation as an
// SVG curve anchored at the actual field row. Dashed = nullable. Interactive:
// type to filter tables/fields, click a table to focus it and its neighbors
// (deep-linkable — the focus is mirrored into the URL hash), Esc resets.

const esc = (v) => String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function generateDataDiagram(schemas, dbs) {
  const sections = [];
  const edges = [];
  for (const [db, reg] of [...dbs.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const cards = [];
    for (const s of schemas.filter((x) => x.raw.database === db).sort((a, b) => a.rel.localeCompare(b.rel))) {
      for (const [name, entity] of Object.entries(s.raw.entities)) {
        const rows = Object.entries(entity.fields).map(([fname, f]) => {
          const keys = [f.pk && "PK", f.ref && "FK", f.unique && "UQ"].filter(Boolean).join(" ");
          const tip = f.summary ? ` title="${esc(f.summary)}"` : "";
          return `<tr id="f:${db}/${name}/${fname}"${tip}><td class="k">${keys}</td><td>${fname}${f.nullable ? "<i>?</i>" : ""}</td><td class="t">${esc(f.type)}</td></tr>`;
        });
        const search = [name, ...Object.keys(entity.fields), s.raw.title, db].join(" ").toLowerCase();
        cards.push(
          `<article class="entity" id="e:${db}/${name}" data-search="${esc(search)}"${entity.summary ? ` title="${esc(entity.summary)}"` : ""}>` +
            `<header><strong>${name}</strong><span>${esc(s.raw.title)}</span></header>` +
            `<table>${rows.join("")}</table></article>`
        );
        for (const [fname, f] of Object.entries(entity.fields)) {
          const m = isStr(f.ref) ? f.ref.match(REF_RE) : null;
          if (m && reg.entities.has(m[1])) {
            edges.push({ from: `f:${db}/${name}/${fname}`, a: `e:${db}/${name}`, b: `e:${db}/${m[1]}`, to: `f:${db}/${m[1]}/${m[2]}`, label: "n:1", dash: f.nullable === true });
          }
        }
        for (const rel of s.raw.relations ?? []) {
          if (!reg.entities.has(rel.from) || !reg.entities.has(rel.to)) continue;
          const label = [rel.label, CARDINALITY[rel.cardinality], rel.via && `via ${rel.via}`].filter(Boolean).join(" · ");
          edges.push({ from: `e:${db}/${rel.from}`, a: `e:${db}/${rel.from}`, b: `e:${db}/${rel.to}`, to: `e:${db}/${rel.to}`, label, dash: false });
        }
      }
    }
    sections.push(`<section><h2>${esc(db)} <em>${esc(reg.engine)}</em></h2><div class="db">${cards.join("")}</div></section>`);
  }

  return `<!doctype html>
<!-- GENERATED from ../data/*.schema.json — edit those files, then run: node scripts/arch-docs.mjs check -->
<html lang="en"><head><meta charset="utf-8"><title>Data model</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  :root { --bg:#fafaf8; --card:#fff; --ink:#1c1c1c; --mut:#71717a; --line:#d4d4d8; --edge:#7c8db5; --pk:#9a6700; --hot:#b4540a; }
  @media (prefers-color-scheme: dark) { :root { --bg:#18181b; --card:#232327; --ink:#e4e4e7; --mut:#a1a1aa; --line:#3f3f46; --edge:#64748b; --pk:#d4a72c; --hot:#e8804d; } }
  * { box-sizing: border-box; } i { color: var(--mut); font-style: normal; }
  body { margin: 0; padding: 2rem 2.5rem 4rem; background: var(--bg); color: var(--ink);
         font: 14px/1.45 ui-sans-serif, system-ui, sans-serif; }
  h1 { font-size: 1.3rem; } h1 + p { color: var(--mut); max-width: 60ch; }
  h2 { font-size: 1rem; margin: 2.5rem 0 1rem; } h2 em { color: var(--mut); font-weight: 400; font-style: normal; }
  .db { display: flex; flex-wrap: wrap; gap: 4.5rem 5.5rem; align-items: flex-start; }
  .bar { display: flex; gap: .9rem; align-items: baseline; margin-top: 1.25rem; }
  .bar input { font: inherit; color: var(--ink); background: var(--card); border: 1px solid var(--line);
               border-radius: 6px; padding: .45rem .7rem; width: 19rem; }
  .bar span { color: var(--mut); font-size: .85rem; }
  .entity { background: var(--card); border: 1px solid var(--line); border-radius: 8px; min-width: 15rem;
            box-shadow: 0 1px 3px rgba(0,0,0,.07); position: relative; z-index: 1; cursor: pointer; }
  .entity.dim { opacity: .35; }
  .entity.focus { border-color: var(--hot); box-shadow: 0 0 0 1px var(--hot); }
  .entity header { display: flex; justify-content: space-between; gap: 1rem; padding: .5rem .75rem;
                   border-bottom: 1px solid var(--line); }
  .entity header span { color: var(--mut); font-size: .8rem; align-self: center; }
  .entity table { border-collapse: collapse; width: 100%; }
  .entity td { padding: .28rem .75rem; border-top: 1px solid color-mix(in srgb, var(--line) 45%, transparent); }
  tr:first-child td { border-top: 0; }
  td.k { color: var(--pk); font-size: .7rem; font-weight: 600; width: 2.2rem; padding-right: 0; }
  td.t { color: var(--mut); text-align: right; font-family: ui-monospace, monospace; font-size: .8rem; }
  svg.edges { pointer-events: none; }
  svg.edges path { fill: none; stroke: var(--edge); stroke-width: 1.5; }
  svg.edges path.dash { stroke-dasharray: 5 4; }
  svg.edges path.hot { stroke: var(--hot); stroke-width: 2; }
  svg.edges text { fill: var(--mut); font-size: 11px; paint-order: stroke; stroke: var(--bg); stroke-width: 3px; }
  svg.edges text.hot { fill: var(--hot); }
</style></head><body>
<h1>Data model</h1>
<p>Generated from <code>*.schema.json</code> — hover a table to trace its relationships,
click it to focus on it and its neighbors, type to filter. Dashed edge = nullable
foreign key. Edit the schema files, never this page.</p>
<div class="bar"><input id="q" type="search" placeholder="Filter tables and fields…" autocomplete="off"><span id="hint"></span></div>
${sections.join("\n")}
<script>
const EDGES = ${JSON.stringify(edges).replace(/</g, "\\u003c")};
const NS = "http://www.w3.org/2000/svg";
const $ = (id) => document.getElementById(id);
const cards = [...document.querySelectorAll(".entity")];
const adj = new Map(); // card id -> neighbor card ids, from every edge
for (const e of EDGES) {
  for (const [a, b] of [[e.a, e.b], [e.b, e.a]]) {
    if (!adj.has(a)) adj.set(a, new Set());
    adj.get(a).add(b);
  }
}
let focusId = null;
let layers = []; // [0] lines under the cards, [1] labels above them
function draw() {
  for (const l of layers) l.remove();
  layers = [0, 2].map((z) => {
    const s = document.createElementNS(NS, "svg");
    s.setAttribute("class", "edges");
    s.setAttribute("width", document.documentElement.scrollWidth);
    s.setAttribute("height", document.documentElement.scrollHeight);
    s.style.cssText = \`position:absolute;top:0;left:0;z-index:\${z}\`;
    document.body.appendChild(s);
    return s;
  });
  for (const e of EDGES) {
    const fromEl = $(e.from) ?? $(e.a), toEl = $(e.to) ?? $(e.b);
    const cardA = $(e.a), cardB = $(e.b);
    if (!fromEl || !toEl || !cardA || !cardB) continue;
    if (cardA.offsetParent === null || cardB.offsetParent === null) continue; // filtered out
    const ra = fromEl.getBoundingClientRect(), rb = toEl.getBoundingClientRect();
    const ca = cardA.getBoundingClientRect(), cb = cardB.getBoundingClientRect();
    // Leave each card on the side facing the other card; same column bows out left.
    const aRight = ca.right + 40 < cb.left, bRight = cb.right + 40 < ca.left;
    const x1 = (aRight ? ca.right : ca.left) + scrollX, y1 = ra.top + ra.height / 2 + scrollY;
    const x2 = (bRight ? cb.right : cb.left) + scrollX, y2 = rb.top + rb.height / 2 + scrollY;
    const out = aRight || bRight ? 0.45 * Math.abs(x2 - x1) + 20 : 50;
    const c1 = x1 + (aRight ? out : -out), c2 = x2 + (bRight ? out : -out);
    const p = document.createElementNS(NS, "path");
    p.setAttribute("d", \`M \${x1} \${y1} C \${c1} \${y1}, \${c2} \${y2}, \${x2} \${y2}\`);
    p.dataset.ends = e.a + " " + e.b;
    if (e.dash) p.setAttribute("class", "dash");
    layers[0].appendChild(p);
    if (e.label) {
      const t = document.createElementNS(NS, "text");
      t.setAttribute("x", (x1 + x2) / 2 + (aRight || bRight ? 0 : -out));
      t.setAttribute("y", (y1 + y2) / 2 - 5);
      t.setAttribute("text-anchor", "middle");
      t.dataset.ends = p.dataset.ends;
      t.textContent = e.label;
      layers[1].appendChild(t);
    }
  }
}
function apply() {
  const q = $("q").value.trim().toLowerCase();
  const near = focusId ? new Set([focusId, ...(adj.get(focusId) ?? [])]) : null;
  let shown = 0;
  for (const c of cards) {
    const ok = c.id === focusId || ((!q || c.dataset.search.includes(q)) && (!near || near.has(c.id)));
    c.style.display = ok ? "" : "none";
    c.classList.toggle("focus", c.id === focusId);
    if (ok) shown += 1;
  }
  for (const sec of document.querySelectorAll("section")) {
    sec.style.display = [...sec.querySelectorAll(".entity")].some((c) => c.style.display !== "none") ? "" : "none";
  }
  $("hint").textContent =
    shown === cards.length ? \`\${shown} tables\` : \`\${shown} of \${cards.length} tables — Esc resets\`;
  history.replaceState(null, "", focusId ? "#" + encodeURIComponent(focusId) : location.pathname);
  draw();
}
addEventListener("load", () => {
  const fromHash = decodeURIComponent(location.hash.slice(1));
  if (fromHash && $(fromHash)) focusId = fromHash;
  apply();
});
addEventListener("resize", () => requestAnimationFrame(draw));
$("q").addEventListener("input", apply);
addEventListener("keydown", (ev) => {
  if (ev.key !== "Escape") return;
  $("q").value = "";
  focusId = null;
  apply();
});
document.addEventListener("click", (ev) => {
  const card = ev.target.closest(".entity");
  if (!card) return;
  focusId = focusId === card.id ? null : card.id;
  apply();
});
document.addEventListener("mouseover", (ev) => {
  const card = ev.target.closest(".entity");
  const linked = new Set(card ? [card.id] : []);
  for (const layer of layers) {
    for (const el of layer.children) {
      const hit = card && el.dataset.ends.split(" ").includes(card.id);
      el.classList.toggle("hot", !!hit);
      if (hit) for (const id of el.dataset.ends.split(" ")) linked.add(id);
    }
  }
  for (const el of document.querySelectorAll(".entity")) {
    el.classList.toggle("dim", !!card && !linked.has(el.id));
  }
});
</script>
</body></html>
`;
}

// ---------- index ----------

function posix(p) {
  return p.split(sep).join("/");
}

function generateIndex(docs, schemas) {
  const section = (title, items, render) => {
    const lines = [`## ${title}`, ""];
    lines.push(...(items.length ? items.map(render) : ["_None yet._"]));
    return lines.join("\n");
  };
  const link = (d) => `[${d.fm.title}](${posix(d.rel)})`;
  const byId = (a, b) => (a.fm.id ?? "").localeCompare(b.fm.id ?? "");
  const byPath = (a, b) => a.rel.localeCompare(b.rel);
  const adrs = docs.filter((d) => d.type === "adr").sort(byId);
  const designs = docs.filter((d) => d.type === "design").sort(byPath);
  const views = docs.filter((d) => d.type === "view").sort(byPath);
  const requests = docs.filter((d) => d.type === "request").sort(byId);
  const principles = docs.filter((d) => d.type === "principles");
  const data = schemas.slice().sort((a, b) => a.rel.localeCompare(b.rel));

  return [
    "# Architecture index",
    "",
    "<!-- GENERATED — do not edit. Update doc frontmatter, then run: node scripts/arch-docs.mjs index -->",
    "",
    section("Principles", principles, (d) => `- ${link(d)} — ${d.fm.summary}`),
    "",
    section("Views", views, (d) => `- ${link(d)} (${d.fm.status}) — ${d.fm.summary}`),
    "",
    section("Decisions", adrs, (d) => `- **${d.fm.id}** ${link(d)} (${d.fm.status}) — ${d.fm.summary}`),
    "",
    section("Designs", designs, (d) =>
      `- ${link(d)} (${d.fm.status}) — affects \`${(d.fm.affects ?? []).join("`, `") || "—"}\` — ${d.fm.summary}`),
    "",
    section("Data", data.length ? [null, ...data] : [], (s) =>
      s === null
        ? "- [Relationship diagram](data/index.html) — every entity and relationship, by database"
        : `- [${s.raw.title}](${posix(s.rel)}) (${s.raw.status}) — db \`${s.raw.database}\` (${s.raw.engine}) — affects \`${(s.raw.affects ?? []).join("`, `") || "—"}\` — ${s.raw.summary}`),
    "",
    section("Requests", requests, (d) =>
      `- **${d.fm.id}** ${link(d)} (${d.fm.status} · ${d.fm.phase} · ${d.fm.size}) — ${d.fm.summary}`),
    "",
  ].join("\n");
}

// ---------- main ----------

const cmd = process.argv[2];
if (!existsSync(ROOT)) {
  console.error(`error: ${ROOT} not found (set ARCH_DOCS_DIR or run from the repo root)`);
  process.exit(1);
}

const errors = [];
const docs = loadDocs(errors);
validate(docs, errors);
const screens = lintMockups(errors);
const { schemas, dbs } = loadSchemas(errors);
const dataDocs = schemas.length
  ? [{ path: join(DATA_ROOT, "index.html"), content: generateDataDiagram(schemas, dbs) }]
  : [];
const index = generateIndex(docs, schemas);
const okMsg = () =>
  `ok — ${docs.length} doc(s)${schemas.length ? `, ${schemas.length} data schema(s)` : ""}${screens ? `, ${screens} mockup screen(s)` : ""}, index fresh`;

// Generated artifacts: the index plus one .md per data schema, same freshness rules.
function writeGenerated({ force }) {
  for (const { path, content } of [{ path: INDEX_PATH, content: index }, ...dataDocs]) {
    const current = existsSync(path) ? readFileSync(path, "utf8") : null;
    if (force || current !== content) {
      writeFileSync(path, content);
      console.log(`wrote ${path}`);
    }
  }
}

function staleGenerated() {
  for (const { path, content } of [{ path: INDEX_PATH, content: index }, ...dataDocs]) {
    const current = existsSync(path) ? readFileSync(path, "utf8") : null;
    if (current !== content) errors.push(`${path} is stale — run: node scripts/arch-docs.mjs check`);
  }
}

if (cmd === "index") {
  writeGenerated({ force: true });
  if (errors.length) {
    console.error(`\n${errors.length} lint error(s) remain:\n` + errors.map((e) => `  - ${e}`).join("\n"));
    process.exit(1);
  }
} else if (cmd === "check") {
  // index + lint in one step: regenerating first removes the easiest mistake —
  // editing a doc (especially a request record) and forgetting to re-index.
  // CI keeps plain `lint` so a stale committed index still fails there.
  writeGenerated({ force: false });
  if (errors.length) {
    console.error(errors.map((e) => `  - ${e}`).join("\n"));
    console.error(`\n${errors.length} error(s) across ${docs.length} doc(s)`);
    process.exit(1);
  }
  console.log(okMsg());
} else if (cmd === "lint") {
  staleGenerated();
  if (errors.length) {
    console.error(errors.map((e) => `  - ${e}`).join("\n"));
    console.error(`\n${errors.length} error(s) across ${docs.length} doc(s)`);
    process.exit(1);
  }
  console.log(okMsg());
} else {
  console.error("usage: node scripts/arch-docs.mjs <check|lint|index>");
  process.exit(1);
}
