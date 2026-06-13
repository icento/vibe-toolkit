# vibe-toolkit

Architecture docs as code, designed so AI agents actually find, trust, and maintain
them across a stream of incremental requests ("build this", "fix that", "redesign X").

## Why

Design docs die from two causes: nobody can find the relevant one when making a
change, and nobody updates them when the change ships. This toolkit fixes both with
three mechanisms:

- **Greppable frontmatter.** Every doc declares `affects:` — glob paths into the
  code it governs. An agent about to edit `services/api/**` greps frontmatter and
  loads only the relevant docs, not the whole tree.
- **Two species of doc.** ADRs (`adr/`) are immutable, numbered decision records —
  superseded, never edited — so the *why* behind old and new patterns in the code
  stays explained. Design docs (`designs/`) are living current-state descriptions,
  updated in the same PR as the code.
- **A per-request contract in `CLAUDE.md`.** Recall relevant docs → classify the
  request (most need no doc work; a few need an ADR; conflicts with accepted ADRs
  stop the work and go back to the user) → ship code and docs atomically → re-index.

## Install

```sh
# one-liner, no clone needed (the script fetches the toolkit itself):
curl -fsSL https://raw.githubusercontent.com/icento/vibe-toolkit/main/install.sh | bash -s -- /path/to/your-repo

# or from a clone:
git clone --depth 1 https://github.com/icento/vibe-toolkit.git
./vibe-toolkit/install.sh /path/to/your-repo
```

To upgrade an installed repo, run `.vibe-toolkit/update` in it — the installer
drops that self-updater on every install. It defaults to the ref the repo was
installed from; pass one (`.vibe-toolkit/update v0.8.0`) or set
`VIBE_TOOLKIT_REF=<ref>` to switch. Re-running either install form works too.

Idempotent, and upgrade-aware (conffile-style): `.vibe-toolkit/manifest` in the
target records the sha256 of every file as installed. On re-install, missing files
are copied, files you never touched are auto-updated when the toolkit changed them,
and files your team modified are **never** overwritten — you get an `attention:`
line to diff and merge by hand when an update exists for them. The agent contract
in `CLAUDE.md` (marker-guarded) follows the same rules. After installing, customize
`docs/architecture/principles.md` and the two views.

## What gets installed

```
docs/architecture/
  INDEX.md                # generated index — the agent's cheap recall layer
  principles.md           # non-negotiable constraints, read once per session
  style.md                # default engineering style (Tiger Style + APoSD design heuristics, compacted)
  ui-principles.md        # default UI/UX rules — WCAG 2.2 AA floor + NN/g heuristics
  views/                  # C4 context + containers (mermaid, never images)
  adr/                    # immutable decision records (ADR-0001/0002 ship as seeds)
  designs/                # living per-component docs, one concern per file
  data/                   # the data model: *.schema.json → generated interactive diagram
  requests/               # the request ledger: one dir per tracked request
  _templates/             # adr.md, design.md, data.schema.json + request/ lifecycle templates
design-system/            # tokens.css + components.html + board.css — visual truth for all mockups
  shadcn-bridge.css       # forwards tokens to shadcn/Basecoat variables (theming bridge)
  themes/                 # preset aesthetic directions + showcase board — pick one on first UI work
.claude/skills/
  vibe-request/           # /vibe-request — phased workflow orchestrator (see below)
  vibe-adr/               # /vibe-adr  — create a decision record, handle supersession
  vibe-design/            # /vibe-design — create/update a component design doc
  vibe-schema/            # /vibe-schema — structured data schemas → generated ER diagrams
  vibe-mockup/            # /vibe-mockup — static HTML/CSS mockups on the design system
.claude/agents/
  vibe-planner.md         # planning subagent (fable) — turns the approved design into plan.md
  vibe-implementer.md     # implementation subagent (opus) — executes one plan task
  vibe-qa.md              # QA subagent (fable) — context-isolated, judges against the artifacts
scripts/arch-docs.mjs     # zero-dependency linter + index generator (Node 18+)
.github/workflows/arch-docs.yml   # CI: lint on PRs touching the docs
CLAUDE.md                 # gains the architecture contract section
.vibe-toolkit/            # install manifest + version + `update` self-updater
```

## The request workflow

Non-trivial requests run through a re-entrant state machine driven by
`/vibe-request` and recorded in `docs/architecture/requests/NNNN-<slug>/`:

```
understanding → designing → aligning → planning → implementing → qa → delivered
      ↑ G1 (user approves understanding.md)   ↑ G2 (user approves design + mockups)
```

- **Triage scales the ceremony**: size S skips straight to implement + QA; M adds
  design and gate G2; L runs everything including mockups and both gates.
- **Artifacts are the interface**: each phase reads/writes files
  (`understanding.md`, design docs, data schemas, mockups, `plan.md`,
  `qa-report.md`), so work resumes across sessions and subagents are pointed at
  paths, not chat history.
- **Gates are lint-enforced**: a request whose `phase` crossed a gate without a
  recorded user approval fails `arch-docs.mjs lint`.
- **QA is context-isolated**: fresh agents judge the result against the agreed
  artifacts; findings route back as bug / design-gap / scope-change.
- **Backward transitions are normal** — QA reopening design is the process working.
- **Models are routed by judgment, not uniformly**: the phases where quality
  compounds run on the strongest model (`fable` — the `/vibe-design`,
  `/vibe-adr`, `/vibe-schema`, and `/vibe-mockup` skills, the planner and QA
  subagents) while
  execution runs on `opus` (the implementer subagent). Pins use aliases, never dated model ids, so
  installed repos track current models. Override everything with the
  `CLAUDE_CODE_SUBAGENT_MODEL` env var, or edit the `model:` frontmatter in
  `.claude/agents/` and `.claude/skills/` (the manifest then treats those files
  as yours and stops auto-upgrading them).

## The tooling

```sh
node scripts/arch-docs.mjs check   # regenerate the index, then validate — the everyday command
node scripts/arch-docs.mjs lint    # validate only — CI uses this so a stale committed index fails
node scripts/arch-docs.mjs index   # regenerate docs/architecture/INDEX.md
```

Lint enforces: required fields (`title`, `summary`, `status`, `date`), status enums,
`ADR-NNNN` ids matching filenames, `supersedes` targets existing **and** carrying
`status: superseded`, gate approvals matching each request's phase, and non-stale
generated artifacts. The index embeds request status/phase, so request records
re-index often — `check` exists so that can never be forgotten.

The data model is part of the same loop: `docs/architecture/data/*.schema.json`
holds entities, fields, and relations as structured JSON (one file per domain, each
declaring its `database` + `engine` — multiple databases coexist, but refs never
cross one). `check` validates shape and referential integrity across files, then
compiles the whole model to `data/index.html` — a self-contained, interactive
relationship diagram (no libraries, no network): filter tables by typing, click one
to focus on it and its neighbors, hover to trace edges. It is never hand-edited;
lint fails when it drifts from the schemas.

## Repo layout

`template/` is the payload `install.sh` copies into target repos. Everything outside
it is the toolkit itself.

## License

MIT. The bundled style guide (`template/docs/architecture/style.md`) is compacted
from TigerBeetle's [TIGER_STYLE.md](https://github.com/tigerbeetle/tigerbeetle/blob/main/docs/TIGER_STYLE.md)
(Apache-2.0), with attribution in the file. Its "Design — modules & interfaces"
section is an original distillation, in our own words, of the ideas in John
Ousterhout's *A Philosophy of Software Design* (no text is reproduced from the book).
