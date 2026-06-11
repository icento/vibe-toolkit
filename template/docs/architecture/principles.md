---
title: Engineering principles
summary: Non-negotiable constraints and conventions that apply to every change in this repository.
status: current
date: 2026-06-11
affects: ["**"]
tags: [process]
---

## Principles

<!-- Replace these examples with your project's real constraints. Keep each one
     short, testable, and worth stopping a PR over. Delete anything aspirational. -->

- **Example:** all external I/O goes through an adapter in `adapters/`; domain code never imports an SDK directly.
- **Example:** no new runtime dependency without an ADR.
- **Example:** every public interface change updates the matching design doc in the same PR.
