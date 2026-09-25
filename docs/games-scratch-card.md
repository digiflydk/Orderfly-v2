# Games · Scratch Card V1

## Overview
Games appears under Promotions in Superadmin. Scratch Card is the first game. An administrator with company-wide `orderfly.website:view` selects a brand, enters copy and prizes, limits the number of cards, sets per-card odds, and chooses future placement on every brand page or explicit paths. The preview supports pointer scratching on phone or desktop, an accessible reveal button and repeatable browser-only sample draws. A mobile-width switch shows the layout at 390 px. This release is a **draft editor and administrator preview only**. No public route, email capture, voucher, customer play, campaign send, or activation exists.

## Database structure and paths
`gameScratchDrafts/{brandId}` stores `brandId`, `title`, `instruction`, `revealText` (no-win text), optional `logoUrl`, `cardsPerPlay` (1–6), `totalCardLimit`, `prizes` (name, type, value, probabilityPercent, maxWinners), `placement` (`all` or `selected`), `paths` (up to 30 local paths), `status: draft`, and `updatedAt`. `auditLogs/{generatedId}` stores module `games`, entity `scratch-card`, brand and actor IDs, action, path and timestamp in the same transaction. Existing `brands/{brandId}` supplies the default logo, and `platformAdminControl/access-v1` is read to check tenant ownership and policy. No customer or prize-claim documents are created.

## Schema to UI mapping
| UI | Field |
| --- | --- |
| Brand picker | `brandId` |
| Brandlogo | `logoUrl`, or brand's existing `logoUrl` when empty |
| Overskrift / Instruktion | `title` / `instruction` |
| Tekst hvis kortet ikke vinder | `revealText` |
| Kort pr. spil / samlet antal kort | `cardsPerPlay` / `totalCardLimit` |
| Præmieliste | `prizes` |
| Hele brandsitet / valgte sider | `placement` |
| Stier, én pr. linje | `paths` |

Each prize has a descriptive name, type (`percent`, `amount`, `item`), numeric value for discounts, chance in percent **per card**, and a cap on winners for the campaign. The remaining probability is a no-win result. A player could reveal more than one winning card when multiple cards are configured. These are draft rules; caps are displayed but not consumed in preview.

## Validation and authorization
Brand ID must be a native 1–128 character document ID. Copy lengths are bounded. A logo override must be an HTTPS URL. Cards per play are 1–6 and campaign card limit is 1–1,000,000. There are 1–12 prizes, total odds cannot exceed 100%, and each prize cap cannot exceed the campaign card limit. Percentage discounts are 1–100%, amount discounts are positive, and product prizes have no numeric value in this preview. Paths begin with a single `/`, contain only letters, numbers, slashes, hyphens or underscores, and cannot repeat; selected placement requires at least one path. The server validates all input. Reads require company-wide website view grants. A save checks native brand ownership and website create/edit permission within the Firestore transaction. The navigation check is display-only. The status is written as `draft` by the server regardless of client input.

## Audit and data dump
The save and audit entry commit together. Operators can inspect `gameScratchDrafts/{brandId}` and query `auditLogs` for `module=games` and `entity=scratch-card`. These are configuration records, not marketing consents or prize claims. Do not export customer data because this version creates none.

## Backlog and activation gate
A later release must add verified customer identity, explicit marketing consent when required, server-side play allocation and limits, prize inventory, idempotent claims, redemption bound to the native customer and payment, suppression/revocation, terms and odds, tracking and a public brand-site mount. Placement settings must then be enforced server-side and integrated with actual published brand routes. No admin control in this release can activate customer play. Omnisend's existing wheel remains separate.

## Tests
Run `npm run typecheck`, `node --test tests/unit/games-scratch-card.cjs`, and `npm run build`. Verify save/reload, unauthorized brand access, mouse/touch scratching, reveal button, mobile 390 px and desktop preview. Preview probabilities use local browser draws for visual review; they do not enforce caps or prove live prize distribution. Live verification after deployment remains read-only until an authorized controlled test is defined.
