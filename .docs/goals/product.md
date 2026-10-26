# Product goals

Status: current as of 2026-10-26 (version 0.1.18).

## Purpose

An OpenCode plugin (`/mosp`) that helps choose a model: one sortable table of
the models available in the user's OpenCode installation, with price and
benchmark quality side by side.

## G1 — Show every available model

- Source: the OpenCode host catalog, read on every panel mount (D-0018).
- Columns: Model, Provider, Ctx (context window), In $/M, Out $/M.
- Prices normalized to USD per 1M tokens; `free` only for an explicit zero.

## G2 — Show trustworthy quality signals

- Columns `Coding` (`aa_coding_index`) and `Intel` (`aa_intelligence_index`)
  from LLMBenchmark.ai (D-0020, D-0023).
- Reported values only, **no derived ranks**.
- Values are attached only through exact ids or owner-reviewed mappings;
  sibling stand-ins are marked `~` and never shown as the model's own score.
- Missing data renders `—`; nothing is fabricated or zero-filled.

## G3 — Fast, offline-first interaction

- Opening, toggling, sorting, filtering never hit the network; only
  `/mosp update` or the `[update]` button fetch (D-0024).
- Any one source failing leaves the rest of the table usable (partial/stale
  status).

## G4 — Controls

- Click-to-sort on every column, both directions, missing values last,
  deterministic ties.
- `[free]` filter; `[update]` button; `/mosp toggle|status|update|redraw|sort <column>`.
- Sort choice persists across restarts.

## Non-goals (removed by decisions)

Text search (D-0016), ranking selector chips (D-0015), GPQA / LiveCodeBench
(D-0020), rank columns (D-0023).

## Definition of done (v0.1)

Adapted from [PLAN §8](../decisions/history/PLAN.md); items 4/5/9 reflect
D-0020/D-0023.

1. Loads in OpenCode 2.1.4 without runtime errors.
2. All catalog models represented.
3. Prices in USD/1M from the registry.
4. Benchmark rows carry metric, source URL, observed date.
5. Coding and Intel sortable independently.
6. No fabricated scores/prices.
7. Every column sortable both directions.
8. Deterministic sorting, missing last.
9. Filters operate on normalized records.
10. Panel open/close via native mechanism.
11. Command toggle exists.
12. Source failures isolated; stale state shown.
13. Tests, lint, typecheck, format check pass.
14. Architecture and source docs current under `.docs/`.
15. Complex paths commented.
16. No secrets/caches/generated files in git.
17. Version/owner/license metadata correct.
18. Agents performed no commit/push/publish.
