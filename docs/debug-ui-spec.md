# Orderfly — Debug UI Specification (Health Dashboard)

## Purpose
Defines the visual states and thresholds for `/api/debug/all` results rendered in Superadmin.

## Checks
| Check              | Description                         | Green                     | Amber                 | Red                           |
|--------------------|-------------------------------------|---------------------------|-----------------------|-------------------------------|
| Firebase Admin     | Admin SDK init                      | init ok                   | retry succeeded       | init error                    |
| Firestore R/W      | Test doc roundtrip latency          | < 1s                      | 1–3s                  | > 3s or failure               |
| Stripe Webhook     | Last successful event timestamp     | < 15 min                  | 15–60 min             | > 60 min                      |
| OpenAPI Spec       | `/api/docs` reachable + endpoints   | 200 + all ops visible     | 200 + partial missing | not reachable / 5xx           |
| Settings Presence  | `settings/general` exists + fields  | doc ok                    | missing optional      | doc missing / invalid         |

## Display
- Grid of **status cards** with Green / Amber / Red.
- Each card includes: **title**, last check time, **message**, and **Quick Actions** (links to `/api/docs`, `/openapi.json`, collection pages).

## Mapping to `/api/debug/all`
- Prefer adding fields for: `adminInit`, `firestoreRoundtripMs`, `stripe.lastSuccessAt`, `openapi.ok`, `settings.general.ok`.
- UI thresholds map exactly to the table above.

## Suggested UI Routes
- `/superadmin/debug/health` (SSR, dynamic, no cache)
