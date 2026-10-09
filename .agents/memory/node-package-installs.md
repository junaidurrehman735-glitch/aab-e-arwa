---
name: Portable npm installs
description: Replit npm registry and package setup behavior that can affect external CI lockfiles.
---

When producing an npm lockfile for external CI, verify it is portable outside Replit. The default npm registry in this workspace points to Replit’s internal mirror; a lockfile generated from that mirror can contain internal resolved URLs. Recreating the lockfile without the old lock and validating `npm ci` against the public npm registry verified portability.

Package setup can also add unrelated language modules to `.replit`, even when only a Node package was requested. Check the workspace diff after package tooling and discard unrelated runtime changes.

**Why:** An internal lockfile registry URL can prevent external CI from downloading dependencies, and an unrelated toolchain change expands the requested scope.

**How to apply:** Before committing npm dependency changes, check lockfile registry references, validate a clean install with the target registry, and review all workspace diffs for runtime/config changes.
