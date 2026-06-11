#!/usr/bin/env node
// arch-docs.mjs — lint and index docs/architecture. Zero dependencies.
//
//   node scripts/arch-docs.mjs check   regenerate the index, then validate — the everyday command
//   node scripts/arch-docs.mjs lint    validate only (CI: a stale committed index fails here)
//   node scripts/arch-docs.mjs index   regenerate docs/architecture/INDEX.md
//
// Override the docs root with ARCH_DOCS_DIR (default: docs/architecture).

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
  if (relPath === "principles.md" || relPath === "style.md" || relPath === "ui-principles.md") return "principles";
  return null;
}

// ---------- frontmatter (minimal YAML subset: scalars, [inline]/dashed lists, one-level maps) ----------

function unquote(s) {
  return s.replace(/^["'](.*)["']$/, "$1");
}

function parseFrontmatter(text) {
  if (!text.startsWith("---\n")) return { error: "missing frontmatter block" };
  const end = text.indexOf("\n---", 4);
  if (end === -1) return { error: "unterminated frontmatter block" };
  const data = {};
  let openKey = null; // key whose indented children we are collecting
  for (const line of text.slice(4, end).split("\n")) {
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
      data[key] = inner === "" ? [] : inner.split(",").map((s) => unquote(s.trim()));
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
      errors.push(`${path}: unexpected location — docs live in adr/, designs/, views/, requests/, principles.md, style.md, or ui-principles.md`);
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
      } else if (/^(adr|designs|views)\//.test(ref)) {
        if (!existsSync(join(ROOT, ref))) errors.push(`${path}: outcome references missing file ${ref}`);
      }
    }
  }
}

// ---------- index ----------

function posix(p) {
  return p.split(sep).join("/");
}

function generateIndex(docs) {
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
const index = generateIndex(docs);

if (cmd === "index") {
  writeFileSync(INDEX_PATH, index);
  console.log(`wrote ${INDEX_PATH} (${docs.length} docs)`);
  if (errors.length) {
    console.error(`\n${errors.length} lint error(s) remain:\n` + errors.map((e) => `  - ${e}`).join("\n"));
    process.exit(1);
  }
} else if (cmd === "check") {
  // index + lint in one step: regenerating first removes the easiest mistake —
  // editing a doc (especially a request record) and forgetting to re-index.
  // CI keeps plain `lint` so a stale committed index still fails there.
  const current = existsSync(INDEX_PATH) ? readFileSync(INDEX_PATH, "utf8") : null;
  if (current !== index) {
    writeFileSync(INDEX_PATH, index);
    console.log(`wrote ${INDEX_PATH} (${docs.length} docs)`);
  }
  if (errors.length) {
    console.error(errors.map((e) => `  - ${e}`).join("\n"));
    console.error(`\n${errors.length} error(s) across ${docs.length} doc(s)`);
    process.exit(1);
  }
  console.log(`ok — ${docs.length} doc(s), index fresh`);
} else if (cmd === "lint") {
  const current = existsSync(INDEX_PATH) ? readFileSync(INDEX_PATH, "utf8") : null;
  if (current !== index) errors.push(`${INDEX_PATH} is stale — run: node scripts/arch-docs.mjs index`);
  if (errors.length) {
    console.error(errors.map((e) => `  - ${e}`).join("\n"));
    console.error(`\n${errors.length} error(s) across ${docs.length} doc(s)`);
    process.exit(1);
  }
  console.log(`ok — ${docs.length} doc(s), index fresh`);
} else {
  console.error("usage: node scripts/arch-docs.mjs <check|lint|index>");
  process.exit(1);
}
