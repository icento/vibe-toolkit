# Request ledger

One directory per tracked request — `requests/NNNN-<slug>/` — containing
`request.md` (the state-machine record: phase, size, gates) plus the phase
artifacts that accumulate as work progresses (`understanding.md`, `plan.md`,
`qa-report.md`). Created and driven by the `/vibe-request` skill; templates live
in `../_templates/request/`.

Track a request here only if it runs through the phased workflow, spans sessions,
or is deferred/declined for a reason worth remembering. Trivial fixes are recorded
by their commits — don't ledger them.
