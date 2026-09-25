# Games · Scratch Card V1

## Overview
Games appears under Promotions in Superadmin. Scratch Card is the first game. An administrator with company-wide `orderfly.website:view` can select a native brand, edit copy and choose a future placement on every brand page or explicit page paths. The right panel previews pointer scratching on mobile/desktop and provides an accessible reveal button. This release is a **draft editor and administrator preview only**. No public route, email capture, voucher, customer play, campaign send, or activation exists.

## Database structure and paths
`gameScratchDrafts/{brandId}` stores `brandId`, `title`, `instruction`, `revealText`, `placement` (`all` or `selected`), `paths` (up to 30 local paths), `status: draft`, and `updatedAt`. `auditLogs/{generatedId}` stores module `games`, entity `scratch-card`, brand and actor IDs, action, path and timestamp in the same transaction. Existing `brands/{brandId}` and `platformAdminControl/access-v1` are read to check tenant ownership and policy. No customer or prize documents are created.

## Schema to UI mapping
| UI | Field |
| --- | --- |
| Brand picker | `brandId` |
| Overskrift | `title` |
| Instruktion | `instruction` |
| Testtekst bag feltet | `revealText` |
| Hele brandsitet / valgte sider | `placement` |
| Stier, én pr. linje | `paths` |

## Validation and authorization
Brand ID must be a native 1–128 character document ID. Copy lengths are bounded. Paths begin with a single `/`, contain only letters, numbers, slashes, hyphens or underscores, and cannot repeat; selected placement requires at least one path. The server validates all input. Reads require company-wide website view grants. A save checks native brand ownership and website create/edit permission within the Firestore transaction. The navigation check is display-only. The status is written as `draft` by the server regardless of client input.

## Audit and data dump
The save and audit entry commit together. Operators can inspect `gameScratchDrafts/{brandId}` and query `auditLogs` for `module=games` and `entity=scratch-card`. These are configuration records, not marketing consents or prize claims. Do not export customer data because this version creates none.

## Backlog and activation gate
A later release must add verified customer identity, explicit marketing consent when required, server-side play allocation and limits, prize inventory, idempotent claims, redemption bound to the native customer and payment, suppression/revocation, terms and odds, tracking and a public brand-site mount. Placement settings must then be enforced server-side and integrated with actual published brand routes. No admin control in this release can activate customer play. Omnisend's existing wheel remains separate.

## Tests
Run `npm run typecheck` and focused UI verification of save/reload, unauthorized brand access, mouse/touch scratch, keyboard reveal and narrow mobile layout. The preview is deliberately repeatable and never issues a prize. Live verification after deployment remains read-only until an authorized controlled test is defined.
