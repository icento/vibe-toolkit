# Architecture index

<!-- GENERATED — do not edit. Update doc frontmatter, then run: node scripts/arch-docs.mjs index -->

## Principles

- [Engineering principles](principles.md) — Non-negotiable constraints, derived from Tiger Style, that apply to every change in this repository.
- [Engineering style (Tiger Style + design heuristics, compacted)](style.md) — Default coding style for all code in this repo — safety, performance, developer experience, in that order. Compacted from TigerBeetle's TIGER_STYLE, plus module/interface design heuristics distilled from Ousterhout's A Philosophy of Software Design.
- [UI/UX principles](ui-principles.md) — Default, testable UI/UX rules — the WCAG 2.2 AA floor plus durable usability heuristics — for every screen, mockup, and frontend in this repository.

## Views

- [Containers](views/containers.md) (draft) — C4 level 2 — deployable units, datastores, and the data flow between them.
- [System context](views/context.md) (draft) — C4 level 1 — the system as a black box, its users, and the external systems it talks to.

## Decisions

- **ADR-0001** [Record architecture decisions as ADRs in the repository](adr/0001-record-architecture-decisions.md) (accepted) — Structural decisions are recorded as numbered, immutable ADRs in docs/architecture/adr; superseded, never edited.
- **ADR-0002** [Run non-trivial requests through a phase-gated, re-entrant state machine](adr/0002-phase-gated-request-workflow.md) (accepted) — Requests are tracked in requests/ as a state machine (understand → design → align → plan → implement → QA → deliver) with lint-enforced user-approval gates.

## Designs

_None yet._

## Data

_None yet._

## Requests

_None yet._
