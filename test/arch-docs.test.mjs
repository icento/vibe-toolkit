// Characterization + drift tests for template/scripts/arch-docs.mjs.
//
// These are toolkit-development tests: they live outside template/, so they are
// never installed into target repos. They pin the linter's observable behavior
// (exit code + messages) so the script can be refactored without silent drift,
// and they guard the script's enums against the prose that documents them.
//
//   node --test            from the repo root, or: node --test test/
//
// Strategy: black box. Each case builds a throwaway docs root from a {path:
// contents} map, runs the real script against it via ARCH_DOCS_DIR, and asserts
// on the outcome — no imports from the script, so its internals stay free to move.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const SCRIPT = join(ROOT, "template", "scripts", "arch-docs.mjs");
const DATE = "2026-06-13";

function writeAll(root, files) {
  for (const [rel, content] of Object.entries(files)) {
    const p = join(root, rel);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, content);
  }
}

// Run a command against a fresh docs root built from `files`. `mockups` (a
// {path: contents} map) seeds a sibling mockups root; when absent MOCKUPS_DIR
// still points at an empty dir so the real repo's mockups never leak in.
function run(cmd, files, { mockups } = {}) {
  const base = mkdtempSync(join(tmpdir(), "archdocs-"));
  const docsRoot = join(base, "docs", "architecture");
  const mockRoot = join(base, "mockups");
  mkdirSync(mockRoot, { recursive: true });
  writeAll(docsRoot, files);
  if (mockups) writeAll(mockRoot, mockups);
  try {
    const stdout = execFileSync("node", [SCRIPT, cmd], {
      env: { ...process.env, ARCH_DOCS_DIR: docsRoot, MOCKUPS_DIR: mockRoot },
      encoding: "utf8",
    });
    return { status: 0, stdout, stderr: "" };
  } catch (e) {
    return { status: e.status ?? 1, stdout: e.stdout ?? "", stderr: e.stderr ?? "" };
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
}

// Build a frontmatter doc. Scalar values are emitted as `key: value`; pass list
// or map syntax as a raw string in the value (e.g. affects: "[src/**]").
function md(fields, body = "body") {
  const lines = ["---"];
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined) continue; // omit the key entirely, don't emit "key: undefined"
    lines.push(`${k}: ${v}`);
  }
  lines.push("---", "", body);
  return lines.join("\n");
}

const adr = (over = {}) =>
  md({ title: "T", summary: "S", status: "accepted", date: DATE, id: "ADR-0001", affects: "[src/**]", ...over });
const design = (over = {}) =>
  md({ title: "T", summary: "S", status: "current", date: DATE, affects: "[src/**]", ...over });
const request = (over = {}) =>
  md({ title: "T", summary: "S", status: "open", date: DATE, id: "REQ-0001", phase: "understanding", size: "S", updated: DATE, ...over });

const passes = (r) => assert.equal(r.status, 0, `expected pass, got:\n${r.stderr}`);
const failsWith = (r, needle) => {
  assert.equal(r.status, 1, `expected failure for: ${needle}`);
  assert.ok(r.stderr.includes(needle), `expected error containing "${needle}", got:\n${r.stderr}`);
};

// ---------- valid baselines ----------

test("a minimal valid ADR passes", () => {
  passes(run("check", { "adr/0001-x.md": adr() }));
});

test("a minimal valid design passes", () => {
  passes(run("check", { "designs/core/x.md": design() }));
});

test("a valid open request passes", () => {
  passes(run("check", { "requests/0001-x/request.md": request() }));
});

test("principles.md, style.md, ui-principles.md are recognized doc types", () => {
  const p = md({ title: "T", summary: "S", status: "current", date: DATE });
  passes(run("check", { "principles.md": p, "style.md": p, "ui-principles.md": p }));
});

// ---------- common field + enum validation ----------

test("missing required field is reported", () => {
  const { summary, ...rest } = { title: "T", summary: "S", status: "accepted", date: DATE, id: "ADR-0001", affects: "[a]" };
  failsWith(run("check", { "adr/0001-x.md": md(rest) }), 'missing required field "summary"');
});

test("malformed date is reported", () => {
  failsWith(run("check", { "adr/0001-x.md": adr({ date: "06-13-2026" }) }), "date must be YYYY-MM-DD");
});

test("status outside the type's enum is reported", () => {
  failsWith(run("check", { "adr/0001-x.md": adr({ status: "current" }) }), 'status "current" not in');
});

// ---------- ids, locations, uniqueness ----------

test("ADR id not matching ADR-NNNN is reported", () => {
  failsWith(run("check", { "adr/0001-x.md": adr({ id: "ADR-1" }) }), "ADRs need id matching ADR-NNNN");
});

test("ADR filename not matching its id number is reported", () => {
  failsWith(run("check", { "adr/0009-x.md": adr({ id: "ADR-0001" }) }), 'filename must start with "0001-"');
});

test("a doc in an unexpected location is reported", () => {
  failsWith(run("check", { "random.md": adr() }), "unexpected location");
});

test("duplicate ids across docs are reported", () => {
  failsWith(run("check", { "adr/0001-a.md": adr(), "adr/0001-b.md": adr() }), "duplicate id ADR-0001");
});

test("a design without affects is reported", () => {
  failsWith(run("check", { "designs/core/x.md": design({ affects: undefined }) }), 'design docs need "affects"');
});

test("a scalar affects reports a clean error, not a crash", () => {
  // `affects: src/**` (no brackets) parses as a string. The validator should
  // report it; the index generator must not throw on the way there.
  const r = run("check", { "designs/core/x.md": design({ affects: "src/**" }) });
  failsWith(r, 'design docs need "affects"');
  assert.ok(!r.stderr.includes("TypeError"), `index generation threw:\n${r.stderr}`);
});

// ---------- request gates ----------

test("size L past understanding without G1 approval is reported", () => {
  const r = request({ size: "L", phase: "designing" });
  failsWith(run("check", { "requests/0001-x/request.md": r }), "gate G1");
});

test("size M past design without G2 approval is reported", () => {
  // Map-valued frontmatter: approvals as nested key: value.
  const r = md({ title: "T", summary: "S", status: "in-progress", date: DATE, id: "REQ-0001",
    phase: "implementing", size: "M", updated: DATE }, "body") + `\n`;
  const withG1 = r.replace("---\n\nbody", `approvals:\n  understanding: ${DATE}\n---\n\nbody`);
  failsWith(run("check", { "requests/0001-x/request.md": withG1 }), "gate G2");
});

test("request directory not matching its id is reported", () => {
  failsWith(run("check", { "requests/9999-x/request.md": request() }), "request directory must be named");
});

test("phase delivered without status done is reported", () => {
  failsWith(run("check", { "requests/0001-x/request.md": request({ phase: "delivered", status: "open" }) }),
    'phase "delivered" requires status "done"');
});

test("approvals given as a list (not a map) is reported", () => {
  const r = md({ title: "T", summary: "S", status: "open", date: DATE, id: "REQ-0001",
    phase: "understanding", size: "S", updated: DATE, approvals: "[understanding]" });
  failsWith(run("check", { "requests/0001-x/request.md": r }), '"approvals" must be a map');
});

// ---------- supersession ----------

test("superseding a missing ADR is reported", () => {
  failsWith(run("check", { "adr/0001-x.md": adr({ supersedes: "[ADR-0099]" }) }), "which does not exist");
});

test("superseding an ADR that is not marked superseded is reported", () => {
  const files = {
    "adr/0001-old.md": adr({ id: "ADR-0001", status: "accepted" }),
    "adr/0002-new.md": adr({ id: "ADR-0002", supersedes: "[ADR-0001]" }),
  };
  failsWith(run("check", files), 'status must be "superseded"');
});

// ---------- frontmatter parser edge cases (the highest-cognitive-load region) ----------

test("a flow sequence wrapped across multiple lines parses", () => {
  const doc = `---\ntitle: T\nsummary: S\nstatus: accepted\ndate: ${DATE}\nid: ADR-0001\naffects:\n  [\n    "a/**",\n    "b/**",\n  ]\n---\n\nbody`;
  passes(run("check", { "adr/0001-x.md": doc }));
});

test("outcome referencing a missing ADR is reported", () => {
  const r = request({ outcome: "[ADR-0099]" });
  failsWith(run("check", { "requests/0001-x/request.md": r }), "outcome references ADR-0099");
});

// ---------- data schemas ----------

const schema = (over = {}) => JSON.stringify({
  title: "T", summary: "S", status: "current", date: DATE, affects: ["src/**"],
  database: "main", engine: "postgres",
  entities: { User: { fields: { id: { type: "uuid", pk: true } } } },
  ...over,
});

test("a valid data schema compiles and passes", () => {
  passes(run("check", { "data/users.schema.json": schema() }));
});

test("an unknown key in a schema is reported", () => {
  const s = schema({ entities: { User: { fields: { id: { type: "uuid", pk: true } }, bogus: 1 } } });
  failsWith(run("check", { "data/users.schema.json": s }), 'unknown key "bogus"');
});

test("a ref to a nonexistent entity is reported", () => {
  const s = schema({ entities: { Post: { fields: { id: { type: "uuid", pk: true }, owner: { type: "uuid", ref: "Ghost.id" } } } } });
  failsWith(run("check", { "data/posts.schema.json": s }), 'no entity "Ghost"');
});

test("an entity with no primary key is reported", () => {
  const s = schema({ entities: { User: { fields: { name: { type: "text" } } } } });
  failsWith(run("check", { "data/users.schema.json": s }), 'needs at least one "pk": true');
});

// ---------- mockup lint ----------

test("a hardcoded color in a mockup is reported", () => {
  const screen = `<div style="color:#ff0000">x</div>`;
  failsWith(run("check", { "principles.md": md({ title: "T", summary: "S", status: "current", date: DATE }) }, { mockups: { "app/home.html": screen } }),
    "hardcoded color");
});

test("an arch-docs:allow marker suppresses a mockup finding", () => {
  const screen = `<div style="color:#ff0000">x</div> <!-- arch-docs:allow brand -->`;
  passes(run("check", { "principles.md": md({ title: "T", summary: "S", status: "current", date: DATE }) }, { mockups: { "app/home.html": screen } }));
});

// ---------- drift guards: script enums vs. the prose that documents them ----------
// Enumeration lives in the README workflow diagram and the agent contract. These
// guard against changing an enum in the script without updating that prose.

function arrayLiteral(source, name) {
  const m = source.match(new RegExp(`const ${name} = \\[([^\\]]*)\\]`));
  assert.ok(m, `could not find "const ${name} = [...]" in the script`);
  return [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
}

test("drift: the README workflow diagram names every phase the script enforces", () => {
  const script = readFileSync(SCRIPT, "utf8");
  const readme = readFileSync(join(ROOT, "README.md"), "utf8");
  for (const phase of arrayLiteral(script, "PHASES")) {
    assert.ok(readme.includes(phase), `README does not mention phase "${phase}"`);
  }
});

test("drift: the README and the agent contract name every triage size", () => {
  const script = readFileSync(SCRIPT, "utf8");
  const readme = readFileSync(join(ROOT, "README.md"), "utf8");
  const contract = readFileSync(join(ROOT, "template", "CLAUDE.md.section"), "utf8");
  for (const size of arrayLiteral(script, "SIZES")) {
    assert.ok(readme.includes(`size ${size}`) || readme.includes(`${size} `), `README does not mention size "${size}"`);
    assert.ok(contract.includes(size), `contract does not mention size "${size}"`);
  }
});
