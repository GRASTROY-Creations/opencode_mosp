# D-0028 — License stays MIT; dependency license audit

- **Date:** 2026-10-26 · **Status:** active · **Decided by:** owner ("Keep MIT")
- **Requirement:** General.md (commercial, closed-source company default);
  Licenses rule 7 (only licenses that allow commercial use).

## Decision

The project keeps the MIT license (`LICENSE`, `package.json`). The copyright
holder line is updated to **GRASTROY Creations, Korcakov Roman**. This is an
owner-approved exception to the closed-source default.

## Dependency audit (2026-10-26, from installed `package.json` files)

| Package | Use | License | Commercial use |
|---|---|---|---|
| `@opencode/plugin` | runtime | MIT | yes |
| `@opencode/theme`, `@opentui/core`, `@opentui/solid`, `solid-js` | peer (host-provided) | MIT | yes |
| `typescript` | dev | Apache-2.0 | yes |
| `eslint`, `@eslint/js`, `typescript-eslint`, `@types/bun` | dev | MIT | yes |
| `prettier`, `eslint-config-prettier` | dev (D-0031) | MIT | yes |

Full table and data-source status: [guide/licenses.md](../guide/licenses.md);
open data-licensing risk: [D-0029](D-0029-data-source-licensing.md).
