---
title: Engineering style (Tiger Style + design heuristics, compacted)
summary: Default coding style for all code in this repo — safety, performance, developer experience, in that order. Compacted from TigerBeetle's TIGER_STYLE, plus module/interface design heuristics distilled from Ousterhout's A Philosophy of Software Design.
status: current
date: 2026-06-13
affects: ["**"]
tags: [style, process]
---

Compacted from [TIGER_STYLE.md](https://github.com/tigerbeetle/tigerbeetle/blob/main/docs/TIGER_STYLE.md)
(TigerBeetle, Apache-2.0), generalized to be language-agnostic. This is the default;
deviations for this project are edited in here, reversals of a rule get an ADR.

## Design goals — in priority order

- **Safety, then performance, then developer experience.** Readability is table stakes, not the goal.
- Simplicity is the hardest revision, not the first attempt — invest in design upfront; a day of design saves weeks in production.
- **Zero technical debt:** incomplete features are acceptable; what ships must be correct. Problems are cheapest to fix in the design phase.

## Design — modules & interfaces

Distilled, in our own words, from John Ousterhout's *A Philosophy of Software Design* — the heuristics for the moments that have structure (a new component, an ADR, a boundary). The priority order above still wins on conflict.

- **Minimize complexity, defined concretely.** Complexity shows up as *change amplification* (one decision forces edits in many places), *cognitive load* (how much you must hold in your head to change something safely), and *unknown-unknowns* (you can't even tell what you'd need to know). The last is the worst — design to eliminate it.
- **Deep modules over shallow ones.** A module's worth is its functionality minus its interface. The best hide substantial implementation behind a simple interface; a class that mostly forwards calls is *shallow* — it adds surface without hiding anything. Prefer fewer deep modules to many thin ones.
- **Information hiding, not leakage.** Each module encapsulates one design decision. The same decision reflected across several modules is *leakage* — the root cause of change amplification. When you can't share the code (a prose contract, a second language), generate the copies so they can't drift.
- **Pull complexity downward.** Better the implementer of a module absorbs complexity once than every caller carry it. A new config knob pushes a decision up to every caller — only add one when you genuinely can't pick a good default.
- **Define errors out of existence.** Prefer interfaces where the exceptional case can't arise over ones that make every caller handle it. Fewer special cases, less complexity.
- **General-purpose tends to be deeper.** A slightly general interface is often simpler *and* more reusable than one tailored to exactly today's need — don't over-specialize the boundary.
- **Different layer, different abstraction.** Adjacent layers with the same abstraction — pass-through methods, pass-through variables — signal a missing or misplaced boundary. Each layer earns its place by adding value.
- **Design it twice.** Sketch at least two structurings before committing; the comparison is where the better one comes from. Do it in the design doc or ADR — the cheapest review point — not in code.
- **Comments capture what code can't:** design intent and the *why*. If you can't describe an interface simply in a comment, the design is probably wrong. (Implementation-comment rules are below.)
- **Strategic over tactical.** "Just make it work" accrues complexity debt that compounds; spend the small amount extra now to keep the design clean. Consistency and obviousness are features — they lower every future reader's cognitive load.

## Safety

- Simple, explicit control flow. No recursion. Centralize control flow in the parent function — push `if`s up and `for`s down; keep leaf/helper functions pure and non-branchy.
- **Bound everything**: every loop, queue, and resource has a fixed upper limit. The only unbounded loop is the top-level event loop, asserted as such.
- All memory/resources acquired at startup where the runtime allows; no unbounded dynamic allocation after initialization.
- Use explicitly-sized types (`u32`/`i64`-style), not architecture-dependent ones.
- **Assertions are the force multiplier** — minimum two per function on average:
  - Assert arguments, return values, pre/postconditions, invariants — and check each property from at least two different code paths (pair assertions).
  - Assert both the positive space (what must be true) and the negative space (what must never happen).
  - Split compound assertions: `assert(a); assert(b);` over `assert(a and b)`.
  - A crash is the correct response to a violated invariant — it downgrades a correctness bug to a liveness bug.
- Functions ≤ **70 lines** (hard limit). Shape: few parameters, simple return type, substantial logic.
- Prefer simple return types — `void` > `bool` > `int` > `nullable` > `error union`; complexity at the return type is viral through the call chain.
- Split compound conditionals into nested `if/else` so every case is explicit; state invariants positively (`if (index < length) { holds }`).
- **Handle every error.** Most catastrophic system failures trace to mishandled non-fatal errors; test the error paths.
- Pass library/API options explicitly at the call site; never rely on defaults that can change under you.
- Treat all compiler/linter warnings as errors from day one.
- Don't react directly to external events — the program runs at its own pace (enables batching, keeps control flow yours).

## Performance

- Design for performance from the outset: the 1000x wins are in the design phase, not in profiling.
- Back-of-envelope sketch before building: network → disk → memory → CPU, in that order of cost; optimize the slowest resource first, weighted by frequency of use.
- **Batch everything** — amortize network, disk, memory, and CPU costs; give the CPU large, predictable chunks of work.
- Be explicit; don't depend on compiler optimizations. Extract hot loops into standalone functions with primitive arguments.

## Naming & developer experience

- Get the nouns and verbs right — a great name is a crisp mental model of what the thing *is* or *does*. Prefer nouns over participles (they compose: `pipeline_max`).
- `snake_case` for variables, functions, files; proper capitalization for acronyms (`VSRState`). Follow the host language's style guide for the rest.
- **No abbreviations.** Long-form flags in scripts (`--force`, not `-f`).
- Units and qualifiers go last, in descending significance: `latency_ms_max`, not `max_latency_ms` — related names then sort and align together.
- Give paired names the same character count where natural (`source`/`target`, not `src`/`dest`) — symmetrical code is easier to verify.
- Name helpers after their caller (`read_sector` → `read_sector_callback`); callbacks go last in parameter lists.
- Don't overload a name with context-dependent meanings; rename when two concepts collide.
- Order matters: important things at the top of the file (`main` first); structs as fields → types → methods; when unsure, sort alphabetically using big-endian naming.
- Treat index, count, and size as distinct types: index + 1 = count; count × unit = size. Show division intent explicitly (exact / floor / ceil).

## State, scope & cache invalidation

- Declare variables at the smallest possible scope; compute and check values close to where they're used — most bugs are gaps in time or space between check and use.
- Don't duplicate state or alias variables — copies drift out of sync.
- Functions run to completion without suspending, so their precondition assertions hold for their whole lifetime.
- Guard against buffer bleeds: zero padding, group allocation with its `defer`/cleanup separated by blank lines so leaks are visible.

## Comments, commits & docs

- Comments are well-written prose: full sentences, capitalized, punctuated; explain **why** — show your workings.
- Every test starts with a comment stating its goal and methodology.
- Commit messages are descriptive and durable — PR descriptions don't survive into `git blame`.

## Formatting & tooling — by the numbers

- Run the project formatter; don't hand-format.
- 4-space indent; **100-column hard limit** (use it, but nothing past it); trailing commas to force one-item-per-line wrapping.
- Braces on every `if` unless the whole statement fits on one line (defense against `goto fail`).
- **Minimize dependencies** — every one is a supply-chain, safety, and install-time cost; foundational code aims for zero.
- Standardize on a small toolbox; write scripts in the project's primary language, not shell — portable, typed, cross-platform.
