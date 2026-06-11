---
id: ADR-0001
title: Record architecture decisions as ADRs in the repository
summary: Structural decisions are recorded as numbered, immutable ADRs in docs/architecture/adr; superseded, never edited.
status: accepted
date: 2026-06-11
supersedes: []
affects: ["**"]
tags: [process]
---

## Context

This project receives a continuous stream of incremental changes from humans and AI
agents. Without a durable record of *why* the system is shaped the way it is, each
change is made against guesswork, past decisions get silently reversed, and the code
accumulates patterns nobody can explain.

## Decision

We record every structural or technology decision as an Architecture Decision Record
(ADR) in `docs/architecture/adr/`, numbered sequentially, with machine-readable
frontmatter (`id`, `status`, `affects`, `supersedes`).

Accepted ADRs are immutable. To reverse a decision, write a new ADR that lists the
old one in `supersedes:` and flip the old one's status to `superseded`. Current-state
component descriptions live separately in `docs/architecture/designs/` and are
updated in the same change as the code they describe.

## Alternatives considered

- **Wiki / external docs** — drifts from the code, invisible to agents working in the repo.
- **One big ARCHITECTURE.md** — too expensive to read incrementally; merge-conflict magnet; history of decisions is lost on every edit.
- **No docs, code is the truth** — code shows *what*, never *why*; agents re-litigate settled decisions.

## Consequences

Every PR that makes a structural choice must include an ADR (use the `/vibe-adr` skill).
Agents must consult ADRs whose `affects` globs match the files they edit, and must
stop and flag conflicts with accepted ADRs instead of silently overriding them.
The index (`INDEX.md`) is generated — run `node scripts/arch-docs.mjs index` after
changing any frontmatter.
