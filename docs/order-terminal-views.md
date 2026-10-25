# Terminal history and future orders (#617 / #624 / #625)

`TerminalHistory` and `TerminalPreorders` are controlled presentation components used by the merchant terminal. They consume the authorized JSON `TerminalOrder` DTO. They do not load Firestore, choose authority, update order state, or submit print jobs.

## History

The parent supplies the authorized brand/location context and the current page of history. Search and bestillingsdato (created-at) date filters are submitted through `onFiltersChange`, including trimmed search and validated inclusive calendar-day inputs. The parent resets its cursor and calls the scoped read API. Filtering only a previously loaded page would hide matches and is not supported. Restaurant selection belongs to the terminal header; rows show their restaurant explicitly.

An empty page with `hasMore` is not reported as a complete empty history. The operator can continue bounded scanning. Loading is explicit. An error preserves visible rows but marks them potentially stale, offers retry and disables reprint/pagination. Read-only users receive no reprint callback/button. Detail callbacks are read-only; the parent opens details. Reprint callbacks open the explicit confirmation controls owned by the printing lane, never print immediately.

No turnover/completed-count KPI is computed from paginated rows. Refunded amounts are visible, separate from the original total. Paid/pending/failed labels come from payment status, never from fulfillment status.

## Preorders

The server decides eligibility using the Copenhagen calendar day: fulfillment dates strictly after today's restaurant-local day are preorders. Later today stays on the active board with its scheduled time. At Copenhagen midnight the next refresh moves eligible orders to the board. Opening a future order never changes its status.

Rows sort by the absolute fulfillment instant, with an ID tie-breaker and unknown timestamps last. Date headings and displayed times use `Europe/Copenhagen`, including daylight-saving transitions. Missing/invalid or zone-less timestamp strings show `Tidspunkt mangler`, not the device's guessed time. The read model normally returns canonical ISO strings or null.

## Component contract

- History: `orders`, `filters: {search,dateFrom,dateTo}`, `onFiltersChange`, `onSelectOrder`, optional `onReprint`, `loading`, `error`, `onRetry`, `hasMore`, `onLoadMore`.
- Preorders: the same presentation/action props, without history filters; optional `serverTime` is accepted for the parent contract. Filtering remains server-owned.

## Local verification

- `node --test tests/unit/terminal-views.cjs`: date boundary/DST, invalid input, midnight eligibility, sorting and history validation.
- `CART_CHROMIUM_PATH=<local Chromium> node --test tests/unit/terminal-views-browser.cjs`: actual components plus compiled application CSS, real Chromium, synthetic parent callbacks at iPad portrait/landscape widths. Covers filters/reversed dates, details, explicit reprint, pagination/empty scan, stale errors, loading, read-only omission and no automatic side effects.
- `npm run typecheck` for the integrated application.

These local tests do not establish actual merchant login, production read behavior, physical iPad Safari/audio/sleep behavior or paper output. Coordinator owns independent review, current-head CI/release gates and live acceptance before issue closure. No GitHub Actions or production writes are used by these tests.
