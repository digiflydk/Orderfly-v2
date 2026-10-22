# Printer activity metadata in the superadmin overview

UI slice #455 of #344 / #361 reads the optional `activity` projection on each
authorized printer response item:

```ts
{
  activatedAt: number | null;
  lastConfirmedPrintAt: number | null;
  printHistory: 'unknown' | 'never' | 'confirmed';
}
```

Dates are server-origin epoch milliseconds, nonnegative safe integers within
JavaScript's supported date range. The client accepts only the exact three fields
and consistent history: `confirmed` requires a last-confirmed-print timestamp;
`unknown` and `never` require that timestamp to be null. A malformed projection
rejects the whole page through the existing generic read-error state. The UI does
not display arbitrary provider fields or repair malformed metadata.

Both date columns use Danish formatting with the explicit Europe/Copenhagen
timezone, even when the viewer's device uses another timezone. The semantic
`time` element retains the UTC ISO instant. Activation is the most recent audited
software lifecycle activation; it does not establish hardware readiness or a
physical print. Unknown activation remains `Ikke registreret`.

`printHistory: never` displays `Aldrig printet`. Unknown history, including a legacy
response with no activity field, remains `Ikke registreret`; missing data is never
used as evidence of no previous print. A known activation can coexist with unknown
historical use. A confirmed last-use timestamp can only be supplied by the backend
after authoritative printer acknowledgement, not from a job being queued, a
simulator, a preview, the browser clock or a synthetic test.

The backend data contract and writers belong to sibling #344 work. Actual native
acknowledgement persistence remains prerequisite #456. Shipping this UI alone does
not complete #344, #361 or #341. Existing row authorization, revisions, mutations,
filtering and pagination remain unchanged.

## Verification

The actual `PrinterOverview` React component is tested in Chromium by
`tests/unit/printing-ui-browser.cjs`. The two new tests first failed before the UI
change: authoritative dates were discarded, and contradictory metadata was
accepted. They cover Copenhagen dates across a UTC day boundary while the browser
uses Los Angeles time; confirmed/never/unknown/legacy states; and rejection of
invalid timestamps, incomplete/extra fields and contradictory history. These are
component fixtures, not authenticated production or physical-printer evidence.

After backend integration and reviewed deployment, Claude should verify the same
states using real authenticated persisted test data, retain the deployed version,
and keep the parent issues open until their remaining acceptance is fulfilled.
