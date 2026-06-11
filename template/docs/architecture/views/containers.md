---
title: Containers
summary: C4 level 2 — deployable units, datastores, and the data flow between them.
status: draft
date: 2026-06-11
affects: []
tags: [view, c4]
---

## Container diagram

<!-- One node per deployable/runnable unit (service, worker, datastore, SPA).
     Anything finer-grained belongs in a design doc under designs/. -->

```mermaid
flowchart LR
    web[Web app] --> api[API service]
    api --> db[(Database)]
```

## Containers

- **API service** — responsibility, runtime, where it lives in the repo.
- **Database** — what it stores, who reads/writes it.
