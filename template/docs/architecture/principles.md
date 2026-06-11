---
title: Engineering principles
summary: Non-negotiable constraints, derived from Tiger Style, that apply to every change in this repository.
status: current
date: 2026-06-11
affects: ["**"]
tags: [process]
---

## Principles

<!-- Defaults distilled from the Tiger Style rules in style.md. Edit them to fit
     this project; keep each one short, testable, and worth stopping a PR over.
     Reversing one gets an ADR. -->

- **Safety, then performance, then developer experience.** When two concerns conflict in a review, resolve them in that order (details in [style.md](style.md)).
- **Zero technical debt.** What merges is correct and complete in itself: an incomplete feature is acceptable, a known-broken or "TODO: fix later" one is not.
- **No new runtime dependency without an ADR.** Every dependency is a supply-chain, safety, and install-time cost.
- **Bound everything.** No loop, queue, buffer, retry, or cache merges without an explicit upper limit; the only unbounded loop is the top-level event loop.
- **Handle every error.** Swallowed exceptions and ignored return values do not merge, and error paths get tests like happy paths do.
- **Crash on violated invariants.** Code that detects an impossible state stops there; it never patches over the state and continues.
- **Design before build.** Non-trivial work starts with a design doc and a back-of-envelope resource sketch (network → disk → memory → CPU), not with code.
- **Docs move with the code.** A change that alters a component's purpose, interface, or internals updates its design doc or ADR in the same PR.
