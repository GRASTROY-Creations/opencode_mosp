# Agent rules and security guideline

Adopted 2026-10-26 (Adjustment 24). Rules are listed **by priority** (a lower
number wins on conflict). Numbering follows the owner's source documents;
gaps belong to rules filed under other headings (coding standard, licenses,
security), which are reproduced below so this page is complete.

## Agents

1. Coding agents work **exclusively inside the project folder**.
2. Agents may read files, environment variables, and git/svn history.
3. Agents use git/svn **read-only**. Commits, staging, forking, reverting,
   branch switching, checkout, pulling, pushing, fetching, rebasing, merging
   etc. are forbidden. (`git log`, `git diff`, `git status`, `git rev-list`
   are fine.)
4. Proposed changes must be **economic in resources** (token usage): reuse
   existing patterns, classes, functions, variables; otherwise batch and
   compress work.
6. The user is a Senior Software Engineer and Senior Games Engineer: wording
   and design are chosen for that audience (precise, no beginner padding).
11. Documentation lives only in `/.docs` (`examples/`, `decisions/`, `guide/`,
    `test/`, `goals/`). Decisions are dated and explained with code references
    and requirements, linked through
    [decisions/README.md](../decisions/README.md). Every `.docs` change is
    logged in [CHANGELOG.md](../CHANGELOG.md); knowledge is never deleted, only
    corrected with a date and a reference to the alternative. Commentary must
    stay clearly understandable. (Conflict with Coding Standard 11 resolved by
    [D-0025](../decisions/D-0025-docs-root.md).)

## Coding standard (10–15)

See [coding-standard.md](coding-standard.md).

## Licenses

7. External libraries or content are only used under licenses that allow
   **commercial** use (company default: commercial closed-source). See
   [licenses.md](licenses.md); this project's own license is an owner-approved
   exception ([D-0028](../decisions/D-0028-license.md)).

## Security

5. If user data risks being lost or overwritten, **ask the user first** with a
   detailed explanation, the list of data at risk, and the impact on the
   system.
8. Performance vs security: choose **security** if user data is affected,
   otherwise **performance** unless told otherwise — and still ask the user for
   approval.
9. Legacy support vs flexibility: choose **security** if user data is affected,
   otherwise **flexibility** unless told otherwise — and still ask the user for
   approval.

## How these apply here

- User data touched by this plugin: the cache directory
  (`OPENCODE_MODEL_OVERVIEW_CACHE_DIR` or the XDG cache path,
  `src/services/cache.ts`) and the persisted view preferences
  (`model-overview.preferences`, `src/ui/panel-controller.ts`). Changing their
  location, format or schema version (`k_cacheSchemaVersion`) discards existing
  data → rule 5 applies.
- Versioning and commits: agents set the version for the next commit
  ([versioning.md](versioning.md)) but never commit themselves (rule 3).
