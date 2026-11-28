# PM / PO / Work development workflow

Last reviewed: 2026-11-28 (owner process decision; see AGENTS.md "Work process")

## Principle

Orderfly uses the same product-development lifecycle as Esmeralda. The repositories may run different technical test commands because their stacks differ, but the issue states, ownership, Work responsibilities, PO gate and definition of Done are the same.

## Roles

- **PM:** defines business goal, priority and product decisions.
- **PO:** converts requests and bugs into GitHub issues with scope, priority, acceptance criteria, dependencies, test requirements and documentation impact. PO approves plans; an explicit PO/PM instruction to merge is acceptance.
- **Work:** the implementation agent (Claude Code sessions). It writes code, tests and documentation on a feature branch, runs the tests itself, and merges and verifies under the [automatic merge rule](../AGENTS.md#automatic-merge-and-deploy).

GitHub issues, pull requests, CI evidence and repository documentation are the operational source of truth.

## Flow

No step waits for a person unless the issue needs a product decision.

1. PO creates an issue with scope and acceptance criteria. Work proposes a plan when the issue needs one and starts once it is approved. The plan states whether parallel agents will build independent parts, and related work is bundled into one release.
2. Work implements on a feature branch, adds or updates tests and documentation, and opens one PR into `main`.
3. **Tests run in Work's environment, not in GitHub Actions.** Work runs `npm run ci` on the exact head commit. It runs every test step in `scripts/ci/steps.mjs` (typecheck, unit, browser and HTTP regressions, isolated Firestore emulator proofs, Firestore rules tests and the build) and stops at the first failure. Work posts the summary on the PR.
4. Independent code review: Codex, or a separate Claude review agent when Codex is unavailable. Blocking findings are fixed; a new commit needs a new `npm run ci` run and a new review.
5. Work merges under the [automatic merge rule](../AGENTS.md#automatic-merge-and-deploy).
6. **Deployment is automatic.** Firebase App Hosting deploys `main`; the Firestore deployment workflows publish merged rules, indexes and migrations (`docs/firestore-operations.md`). GitHub Actions is used only for these deployments.
7. Work waits for `/api/health` to report the merge commit and for any Firestore deployment run to succeed, then performs the issue's live verification (read-only unless the issue defines a controlled, reversible scenario). A failure leads to an immediate revert PR.
8. The issue is Done when the change is live and its live acceptance criteria are met. Work then emails the short, non-technical release note to the owner (AGENTS.md "Work process", rule 4).

## Process updates reach every session

The process lives on `main`: `AGENTS.md`, `CLAUDE.md` (which imports `AGENTS.md`), this file, `docs/deployment-flow.md` and `.claude/`. A process change takes effect when it is merged to `main`; nobody has to copy it into running chats.

- **New sessions** clone `main` and load `CLAUDE.md` and `AGENTS.md` at start.
- **Sessions on older feature branches:** the `.claude/hooks/process-sync.sh` hook (SessionStart and UserPromptSubmit in `.claude/settings.json`) fetches `origin/main` at start, resume and compaction, and during a session when a prompt is submitted (at most every 15 minutes). When `main` has process changes the branch does not have, it injects `AGENTS.md` and the diff from `main` into the session. The version on `main` then applies, and Work merges `origin/main` into the branch before the next commit or PR update.
- The hook only runs `git fetch` and never changes the working tree or blocks a session. The mid-session check runs when a prompt is submitted, at most every `PROCESS_SYNC_INTERVAL` seconds (default 900).
- A process change is written to the files above, not only in a chat or an issue comment, so the hook can carry it.

## Commands

- `npm run ci`: the full local CI. `npm run ci -- --list` lists the steps, `--from <n>` resumes after a fix (a merge still needs one full run on the final head), `--only <text>` runs matching steps while developing.
- Optional post-deploy checks Work may run when the change touches them: `node scripts/qr-retention-readiness.mjs` (QR retention checkpoint, read only) and the Esmeralda mobile Lighthouse measurement in `docs/storefront/esmeralda-v2-thumbnails.md`.

The environment needs Node, Java 21 (Firestore emulator) and network access once to `cdn.playwright.dev` for the project's Playwright Chromium; `npm run ci` installs the pinned `firebase-tools` into `.cache/`.

## Failure handling

- **`npm run ci` fails:** fix the root cause and run it again; never skip, loosen or delete a test to get green, and never use `[skip ci]` on code.
- **Blocking review finding:** fix and re-review the new head.
- **Deployment or live verification fails after merge:** revert PR at once, then fix forward.
- **External blocker** (credentials, a third-party outage): report it on the issue with what is needed.
