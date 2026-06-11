---
name: vibe-request
description: Drive a request through the phased workflow — understand, design, mock up, align, plan, implement, QA, deliver. Use at the start of any non-trivial request, and to resume one in progress (it reads the request record and continues from the current phase).
---

# Request workflow

State lives in `docs/architecture/requests/<NNNN-slug>/request.md`. **Artifacts are
the interface between phases** — point subagents at files, never at chat history.
After every phase transition: update `phase`, `updated`, and `## Log` in request.md,
then run `node scripts/arch-docs.mjs index` and confirm `lint` passes.

## Intake

1. Check the ledger first: scan `docs/architecture/requests/` for a matching open,
   in-progress, deferred, or declined request — resume it or surface its history
   instead of opening a duplicate.
2. New request: take the next REQ number, create the directory from
   `docs/architecture/_templates/request/`, capture the ask in the user's words.
3. Triage the size, record the reasoning under `## Triage`:
   - **S** — fix/refactor within the existing design. Phases: implementing → qa →
     delivered. No gates, no ledger entry unless it spans sessions.
   - **M** — feature within the current architecture, no UI mockups.
     Phases: understanding → designing → planning → implementing → qa → delivered.
     Gate G2 (design) only.
   - **L** — new component, redesign, or anything with UI. All phases, gates G1 + G2.

## Phases

**understanding** — interview the user: problem, goals, constraints, out-of-scope,
assumptions, open questions. Push back on solutions stated as problems; close every
open question. Write `understanding.md`. Size L: stop and ask for G1 approval —
on an explicit yes, record `approvals.understanding`. **Never self-approve a gate.**

**designing** — follow the architecture contract's recall step, spawning Explore
subagents to scan affected code. Record decisions via `/vibe-adr`, component designs
via `/vibe-design`, UI via `/vibe-mockup`. Link every artifact in `outcome:`.

**aligning** — present what was decided, designed, and mocked up; iterate until the
user explicitly approves → record `approvals.design` (gate G2).

**planning** — write `plan.md` from the approved design: ordered tasks, each sized
for one agent's context, naming files touched, dependencies, and a verification
step. Use a Plan subagent for large scopes.

**implementing** — execute `plan.md`, checking tasks off as they land. Independent
tasks run as parallel subagents (worktree isolation when they touch overlapping
files); each subagent's prompt names the artifact files to read first. Design-doc
updates ship in the same change as the code.

**qa** — spawn fresh subagents with NO implementation context. Their inputs:
`understanding.md`, the design docs, mockups, and `plan.md`'s end-to-end
verification section. Their job: break the result against the agreed spec. Write
`qa-report.md` and route each finding:
- **bug** → fix now; stay in qa until the report is clean
- **design-gap** → set phase back to `designing`; update designs/ADRs, re-align if material
- **scope-change** → set phase back to `understanding`; back to the user
Backward transitions are normal — record each in `## Log` with the reason.

**delivered** — give the user a delivery report: what changed, how it was verified
(quote evidence from `qa-report.md`), and how to run it. Set `status: done`,
`phase: delivered`, final index + lint.

## Rules

- Approval dates are recorded only on an explicit user "approved" — lint enforces the
  gates structurally; never backfill a date to get past it.
- Pausing work: set `status: deferred` and capture why; declining: `status: declined`
  with the reason — both make the ledger worth checking at intake.
- New scope after delivery is a new request; scope discovered before delivery stays
  in this one (through a backward transition if needed).
