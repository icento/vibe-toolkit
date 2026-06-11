---
title: System context
summary: C4 level 1 — the system as a black box, its users, and the external systems it talks to.
status: draft
date: 2026-06-11
affects: []
tags: [view, c4]
---

## Context diagram

<!-- Replace with your real actors and external systems. Keep this at black-box
     altitude: if it has an internal module name in it, it belongs in containers.md. -->

```mermaid
flowchart LR
    user([User]) --> system[This system]
    system --> ext[(External service)]
```

## Actors

- **User** — who they are, what they need from the system.

## External systems

- **External service** — what we use it for, who owns the integration.
