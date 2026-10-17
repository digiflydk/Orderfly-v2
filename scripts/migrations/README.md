# Firestore data migrations

Each file `scripts/migrations/<name>.mjs` is one migration for the production data project `orderfly-39325`. It runs only through the manual GitHub workflow **Firestore data migration** (`scripts/firestore-migrate.mjs`), and it must be merged to `main` before it can be applied. See `docs/firestore-operations.md`.

A migration exports:

```js
export const description = 'What the migration changes and why (one line).';

// Reads only. Returns the planned changes as JSON-serializable items, e.g. one per document.
export async function plan(db) {
  return [{ path: 'collection/docId', from: 'old', to: 'new' }];
}

// Applies one planned item. Re-read the document in a transaction and throw if it no longer
// matches the item, so a change made after the reviewed preview is never overwritten.
export async function applyItem(db, item) {}
```

Rules:

- **No personal data in items.** The preview prints the items in the workflow log. Use document ids and non-personal field values.
- **Idempotent.** After a successful apply, `plan` returns no items.
- **Scoped.** Read and write only the brands and collections the migration is about.
- Writes nothing in `plan`. Deletes nothing unless the issue explicitly requires it.
- Add a unit test with a fake database for anything beyond a field rename.
