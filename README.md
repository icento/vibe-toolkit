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

Re-run either form to upgrade when the toolkit has a new version. Pin a branch or
tag for the one-liner with `VIBE_TOOLKIT_REF=<ref>`.

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
  style.md                # default engineering style (Tiger Style, compacted)
  views/                  # C4 context + containers (mermaid, never images)
  adr/                    # immutable decision records (ADR-0001/0002 ship as seeds)
  designs/                # living per-component docs, one concern per file
  requests/               # the request ledger: one dir per tracked request
  _templates/             # adr.md, design.md + request/ lifecycle templates
design-system/            # tokens.css + components.html — visual truth for all mockups
.claude/skills/
  vibe-request/           # /vibe-request — phased workflow orchestrator (see below)
  vibe-adr/               # /vibe-adr  — create a decision record, handle supersession
  vibe-design/            # /vibe-design — create/update a component design doc
  vibe-mockup/            # /vibe-mockup — static HTML/CSS mockups on the design system
scripts/arch-docs.mjs     # zero-dependency linter + index generator (Node 18+)
.github/workflows/arch-docs.yml   # CI: lint on PRs touching the docs
CLAUDE.md                 # gains the architecture contract section
.vibe-toolkit/            # install manifest + version — powers safe upgrades
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
  (`understanding.md`, design docs, mockups, `plan.md`, `qa-report.md`), so work
  resumes across sessions and subagents are pointed at paths, not chat history.
- **Gates are lint-enforced**: a request whose `phase` crossed a gate without a
  recorded user approval fails `arch-docs.mjs lint`.
- **QA is context-isolated**: fresh agents judge the result against the agreed
  artifacts; findings route back as bug / design-gap / scope-change.
- **Backward transitions are normal** — QA reopening design is the process working.

## The tooling

```sh
node scripts/arch-docs.mjs check   # regenerate the index, then validate — the everyday command
node scripts/arch-docs.mjs lint    # validate only — CI uses this so a stale committed index fails
node scripts/arch-docs.mjs index   # regenerate docs/architecture/INDEX.md
```

Lint enforces: required fields (`title`, `summary`, `status`, `date`), status enums,
`ADR-NNNN` ids matching filenames, `supersedes` targets existing **and** carrying
`status: superseded`, gate approvals matching each request's phase, and a non-stale
index. The index embeds request status/phase, so request records re-index often —
`check` exists so that can never be forgotten.

## Repo layout

`template/` is the payload `install.sh` copies into target repos. Everything outside
it is the toolkit itself.

## License

MIT. The bundled style guide (`template/docs/architecture/style.md`) is compacted
from TigerBeetle's [TIGER_STYLE.md](https://github.com/tigerbeetle/tigerbeetle/blob/main/docs/TIGER_STYLE.md)
(Apache-2.0), with attribution in the file.
