---
id: ADR-0002
title: Run non-trivial requests through a phase-gated, re-entrant state machine
summary: Requests are tracked in requests/ as a state machine (understand → design → align → plan → implement → QA → deliver) with lint-enforced user-approval gates.
status: accepted
date: 2026-06-11
supersedes: []
affects: ["**"]
tags: [process, workflow]
---

## Context

Agent-built software fails most often before code is written: requirements are
assumed rather than confirmed, design is implicit, and QA is done by the same
context that implemented (which can only verify what it *meant* to build). At the
same time, work spans sessions — agents have no memory between them — and alignment
points get skipped under momentum.

## Decision

Non-trivial requests run through phases — `understanding → designing → aligning →
planning → implementing → qa → delivered` — recorded in
`docs/architecture/requests/NNNN-<slug>/request.md` and driven by the
`/vibe-request` skill.

- **Artifacts are the interface between phases.** Each phase reads and writes files
  (`understanding.md`, design docs/ADRs, mockups, `plan.md`, `qa-report.md`), so any
  agent can resume from the record and subagents are pointed at paths, not chat history.
- **Gates are explicit and lint-enforced.** G1: the user approves the understanding
  doc; G2: the user approves design + mockups. Approval dates live in `approvals:`;
  the linter rejects a phase that crossed a gate without one.
- **Triage scales the ceremony.** Size S skips to implement + QA (no gates); M runs
  design without mockups (G2 only); L runs everything.
- **Backward transitions are normal.** QA findings route by class: bug → fix;
  design-gap → reopen designing; scope-change → reopen understanding.
- **QA is context-isolated.** Fresh subagents judge the result against the agreed
  artifacts, never against the implementer's intent.

## Alternatives considered

- **One-way pipeline** — forces problems forward; a design flaw found in QA becomes a "bug fix" instead of a design correction.
- **Chat-only process** — not resumable across sessions, not auditable, invisible to subagents.
- **External tracker as the state machine** — invisible to agents working in-repo; fine as a human mirror, link it in `outcome:` instead.

## Consequences

Non-trivial requests start with `/vibe-request`; trivial ones stay ledger-free.
UI consistency comes from `design-system/tokens.css`, which all mockups must import.
Phase transitions update `request.md` and re-run the indexer. The honesty of the
system rests on one rule: approval dates are recorded only on explicit user approval.
