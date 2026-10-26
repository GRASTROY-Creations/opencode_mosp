# Versioning

Scheme (General.md): **`Release.Feature.Fix`**, incremental, lower parts never
reset when a higher part increases.

| Part | Meaning | Changes when |
|---|---|---|
| Release | public release line | owner declares a release (0 = unreleased) |
| Feature | feature line | owner declares a new feature line |
| Fix | **number of the commit** counted from the initial commit (SVN revision equivalent) | every commit |

Examples: `0.1.0 → 0.1.1 → 0.3.33 → 1.3.33` (note `1.3.33`, not `1.0.0`).

## Procedure

Agents never commit, so the version is set for the commit that will carry the
change:

```bash
git rev-list --count HEAD
```

`Fix = that count + 1` while uncommitted changes exist. Write it into
`package.json` `version` together with the change; the owner commits.

Current: **0.1.18** (HEAD = commit 17 on 2026-10-26;
[D-0030](../decisions/D-0030-versioning.md)).
