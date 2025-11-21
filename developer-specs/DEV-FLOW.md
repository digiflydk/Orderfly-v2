# Orderfly Dev Flow — Studio, GitHub, Codex

## Branch model

- Use **one feature branch per EPIC**, not per small task.
- Example for Brand Website:
  - Branch: `feature/epic-522-brand-website`
  - Tasks: 522-01, 522-02, 522-02-FIN, 522-03, ...

## Flow

1. **Studio**
   - Work on the EPIC branch (e.g. `feature/epic-522-brand-website`).
   - Implement tasks according to `/developer-specs/XXXX-task.md`.

2. **Git commit + push**
   - Commit messages should mention the task ID, e.g. `522-03: Brand Website config API`.

3. **Codex review**
   - In Codex, select the EPIC branch.
   - Prompt example:
     > Review the latest changes on branch `feature/epic-522-brand-website` against `/developer-specs/522-03-Config-and-DesignSystem-API.md`.  
     > Check that the Firestore path, TypeScript types, Zod validation, and version string match the spec. Also confirm that no unrelated modules were changed.

4. **ChatGPT (architect review)**
   - Paste Codex review into ChatGPT for a second, higher-level validation.

5. **Pull Request & merge**
   - Create a PR from EPIC branch to `main` when a logical chunk of work is complete (e.g. 522-01 to 522-03).
   - Codex can also review the PR.
   - Merge into `main` only when spec + reviews are OK.

## Levels of control

- Use this full flow (EPIC branch + PR + Codex) for core modules and APIs.
- For minor copy or docs tweaks, commits can go directly to `main` with optional Codex review.
