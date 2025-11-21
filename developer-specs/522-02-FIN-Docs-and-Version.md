# 522-02-FIN — Brand Website Dev Docs Registration & Version Footer

## Goal

Finish 522-02 by:

1. Registering the two Brand Website database docs in the Developer Docs navigation.
2. Updating the global app/footer version to the correct marker for this task.

## Docs registration

Add entries to the Developer Docs config (e.g. `src/lib/superadmin/docs-config.ts`):

```ts
{
  id: 'brand-website-db-structure',
  title: 'Brand Website — DB Structure',
  filename: 'BRAND-WEBSITE-DB-STRUCTURE.md',
  group: 'brand-website',
},
{
  id: 'brand-website-db-paths',
  title: 'Brand Website — DB Paths',
  filename: 'BRAND-WEBSITE-DB-PATHS.md',
  group: 'brand-website',
},
```

Requirements:

* `group` must be `"brand-website"`.
* No removal or rename of existing docs.
* After this, `/superadmin/docs?group=brand-website` should show these docs.

## Version/footer

Update version text used in the footer to:

```text
v1.0.262 • 522-02
```

No other layout or routing changes.

## Non-goals

* No API changes.
* No Brand Website docs hub changes.
* No structural changes outside docs-config and version text.
