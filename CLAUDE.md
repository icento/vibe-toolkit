# vibe-toolkit

This repo is a distributable toolkit: `template/` is the payload that `install.sh`
copies into target repositories to give them architecture-docs-as-code plus the
agent contract that keeps those docs alive. See README.md for the full picture.

Rules for changing this repo:

- `template/scripts/arch-docs.mjs` must stay zero-dependency (Node 18+ stdlib only) —
  target repos must not inherit a dependency from us.
- `template/CLAUDE.md.section` is the agent-facing contract. Keep it under ~60 lines;
  it is prepended to every agent's context in every target repo, so every line costs
  tokens everywhere.
- `install.sh` must stay idempotent and must never overwrite a file the target has
  modified since install (the `.vibe-toolkit/manifest` sha256 records decide this);
  unmodified files are auto-upgraded. Bump `VERSION` whenever `template/` changes.
- After changing anything in `template/docs/`, regenerate its index and lint it:
  `cd template && node scripts/arch-docs.mjs check`
- After changing `install.sh` or the script, smoke-test: install into a temp dir and
  run lint there.
- After changing `template/scripts/arch-docs.mjs`, run its tests: `node --test
  test/arch-docs.test.mjs`. They are black-box (spawn the script against throwaway
  fixtures) and toolkit-only — they live outside `template/`, so they never ship to
  target repos. The suite also guards the script's `PHASES`/`SIZES` enums against the
  prose that documents them (README diagram, `CLAUDE.md.section`).
- Keep README.md's "What gets installed" tree in sync with `template/`.
