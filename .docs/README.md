# opencode_mosp — Knowledge Base

Company: GRASTROY Creations · Author: GRASTROY Creations, Korcakov Roman · License: MIT
(see [decisions/D-0028](decisions/D-0028-license.md)).

This directory is the **only** project documentation root (decision
[D-0025](decisions/D-0025-docs-root.md)). The repository `README.md` is a short
package entry point that links here.

## Table of contents

| Section | Purpose |
|---|---|
| [goals/](goals/README.md) | What the software has to achieve: product scope, platforms, data sources, definition of done |
| [guide/](guide/README.md) | Agent rules, coding standard, naming, versioning, licenses, development workflow, architecture, data-source references |
| [decisions/](decisions/README.md) | Dated decision records with requirement + code references; full history of the project plan and owner knowledge docs |
| [test/](test/README.md) | Test strategy, per-suite reasoning, fixtures |
| [examples/](examples/README.md) | Command, mapping and data-row examples |
| [CHANGELOG.md](CHANGELOG.md) | Dated log of every change to this directory |

## Change policy (Agents rule 11)

- Every change to `.docs/` gets a dated entry in [CHANGELOG.md](CHANGELOG.md).
- Knowledge is **never deleted**. A wrong or outdated statement is not
  removed; it is marked as superseded with a date and a link to the corrected
  statement or the alternative approach (see the "superseded" banner in
  [decisions/history/llmbm-migration-plan.md](decisions/history/llmbm-migration-plan.md)
  for the pattern).
- Files under [decisions/history/](decisions/history/README.md) are frozen
  records; they are only ever appended to, never rewritten.
- Current-state documents (guide, goals, test) may be updated to match the
  code, but each update is logged in the changelog so the previous wording
  stays traceable through the changelog and version history.
