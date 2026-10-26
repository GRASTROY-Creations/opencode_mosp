# D-0030 — Versioning `Release.Feature.<commit count>`

- **Date:** 2026-10-26 · **Status:** active
- **Requirement:** General.md / Versioning: incremental semantic versioning;
  lower parts never reset on a higher increment (0.1.0 → 0.1.1 → 0.3.33 →
  1.3.33); the third part is the number of the current commit counted from the
  initial commit (SVN revision equivalent).

## Decision

`package.json` `version` = `0.1.18`:

- **Release 0** — not released yet.
- **Feature 1** — first feature line (v0.1 scope).
- **18** — `git rev-list --count HEAD` was **17** on 2026-10-26; this change
  set becomes commit 18 when the owner commits it. Agents never commit
  (Agents rule 3), so the number is set for the commit that will carry it.

How to bump and verify: [guide/versioning.md](../guide/versioning.md).
