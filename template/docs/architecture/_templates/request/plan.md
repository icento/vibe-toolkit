# Implementation plan — REQ-NNNN

> Derived from the approved design. Each task is sized to fit one agent's context
> and names the files it touches, so independent tasks can run as parallel subagents.

## Tasks

- [ ] 1. <task> — files: `path/**` — verify: <command or observable behavior>
- [ ] 2. <task> — files: `path/**` — depends on: 1 — verify: <…>

## Risks

What could invalidate this plan mid-flight, and the fallback.

## End-to-end verification

How the whole change is proven working (commands, scenarios, data) — this becomes
the QA phase's starting checklist.
