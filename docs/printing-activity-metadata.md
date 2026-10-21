# Printer activity metadata (#344)

The superadmin overview can project truthful software activation and confirmed-use metadata. This does not enable printing or prove hardware readiness. The full parent #344 remains open until confirmed native acknowledgement persistence (#456) and the applicable QA are delivered.

## Persistence and authority

Each printer may have one credential-free document at `locations/{locationId}/printers/{printerId}/statusMetadata/current`:

- `schemaVersion: 1`, exact native `brandId`, `locationId`, `printerId`.
- `activatedAt`: server-generated epoch milliseconds for the most recent successful audited software `printer.resume`, or null. `activationRevision` identifies that same printer revision/audit record. This is not the date a physical device was provisioned, the printer configuration creation date, or evidence of a physical print.
- `printHistory`: `unknown`, `never`, or `confirmed`.
- `lastConfirmedPrintAt`: authoritative server confirmation time, or null. `lastConfirmedJobId` binds a confirmed value to a canonical immutable job identity and is never returned publicly.

New native printer creation atomically creates a `never` record with null dates. Existing legacy printers without materialization have unknown historical usage; editing them does not fabricate or backfill a date. An actual authorized resume atomically updates only activation time/revision alongside the existing lifecycle audit, capability invalidation and receipt consumption. It preserves known confirmed-use data, or unknown legacy history. The time is generated inside each transaction attempt, never accepted from a caller. All existing write gates and authorization checks remain.

An orphan metadata record causes create collision and full rollback; it is not overwritten. Malformed, foreign, future-revision or future-time metadata blocks resume and overview projection with a safe generic error rather than resetting history.

## Public read projection

The existing scoped printer list gains `activity` only when `overview=true`:

```json
{"activatedAt":null,"lastConfirmedPrintAt":null,"printHistory":"unknown"}
```

The existing native location authorization and strict printer validation run before metadata reads. Read exactly one fixed metadata document per returned printer, after pagination; never read audit or job collections for the table. The table requests 20 rows per location page, so it performs at most 20 metadata lookups there. The generic scoped API remains bounded by its existing maximum page size of 50. Non-overview list/detail projections are unchanged.

Confirmed means a nonnull last-confirmed timestamp and bound job identity; unknown/never must have null last-confirmed data. Unknown history can still have an activation timestamp from a later actual audited resume. The public DTO contains only the two epoch timestamps and history state; no job identity, private metadata, credential, receipt or audit is serialized.

## Remaining confirmed-use prerequisite

Current queue persistence has only queued jobs, with no native confirmed-result writer. This slice does not invent an acknowledgement or treat polling, claiming, downloading, a simulator, or queued job time as physical print success. #456 must connect a real authenticated result/claim identity to atomically persisted confirmation and activity materialization, including replay, out-of-order confirmation, rollback and unknown-outcome handling. Before any future delivery can make a newly created printer's `never` assertion uncertain, that transport must conservatively change the usage state to unknown unless an authenticated confirmed outcome is recorded.

No production data migration, backfill, index operation, flag change, device/Wolt change or physical output is part of this slice. Claude must distinguish controlled isolated QA from production read-only boundaries and physical pilot verification.

## Verification

Run typecheck and the activity-metadata, reads, writes, lifecycle and resume unit suites. They exercise actual production modules with database/session I/O isolated: bounded projection, unknown versus never, native-scope/revision/time corruption, atomic creation collision rollback, activation and confirmed-use preservation, existing authorization/receipt/race/retry/rollback behavior. UI rendering and browser scenarios are a separate coordinated slice (#455).
