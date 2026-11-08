# KDS mobile order board (8 November 2026)

## Scope

This change is a mobile-only presentation for `/kds` (both employee and
dedicated-terminal modes) below the Tailwind `lg` breakpoint (1024px).
The established desktop three-column board, desktop toolbar and generic
`/merchant/orders` experience remain unchanged.

The supplied mobile merchant screenshots are interaction references, not
permission to clone another provider's brand, APIs or commercial features.
Only existing Orderfly flows are connected. The interface does not impersonate
a native Wolt app.

## Mobile workflow

- A top bar shows the current stage, opens the existing left-side KDS settings
  drawer and indicates the actual KDS connection state.
- A fixed, safe-area-aware bottom bar switches between `Nye bestillinger`
  (Received), `I gang` (In Progress) and `Klar` (Ready). Counters derive from
  the same authorized KDS board snapshot. Preorders stay under their existing
  release-time rules and are not counted as Received until released.
- `Klar` is split into `Klar` and `I levering`. Only a Ready delivery order
  with server-authorized managed courier status `picked_up` is treated as
  `I levering`. Booked/assigned/approaching couriers are still waiting for
  handoff, not falsely displayed as out for delivery. Delivered orders continue
  to disappear through the existing authorized backend projection.
- Large cards show a restaurant label, visible order number and customer,
  pickup/delivery label, ring countdown, total/item quantity and collapsible
  native product/modifier/notes details.
- The existing `TerminalDetail` status, payment and reprint actions and
  `KitchenClock` ready-time save are reused. They still call the same
  authorized, audited and idempotent APIs. Payment is not bypassed.
- The mobile drawer exposes Active orders, Preorders, History, location
  selector when several locations are authorized, and a separate Settings page.
  Settings uses divided rows for Sound, Order settings, Language and account
  logout. Navigation uses icons and highlights the selected view; it has no
  date controls or large settings cards. Refresh remains in the main header.
  `Butik` displays existing opening hours read-only. Editing hours, holiday
  exceptions, menu items or closing a location are **not** implemented by
  this KDS layout change.
- An audio banner only reports KDS's own muted/blocked audio state. Browsers
  cannot inspect an iOS device's hardware silent switch or notification
  volume. `Test lyd` requires user interaction and keeps the existing
  browser sound activation flow.
- The existing new-order alert explicitly selects the **Nye bestillinger**
  mobile stage before clearing its notice, even when the operator is viewing
  **I gang** or **Klar**. Enter-fullscreen remains available from the mobile
  header, and its exit control stacks above the sticky header while scrolling.
- Network/authorization failures are differentiated from empty orders.
  Unknown/revoked scope never displays cached customer data.
- The actual order board is mounted once per device: `TerminalBoard` at or
  above 1024px and `MobileKdsBoard` below 1024px after the client media query
  resolves. CSS also hides the irrelevant mobile/desktop chrome. This avoids
  duplicated order component lifecycles, tracked delivery widgets and actions.

## Source map

- `src/lib/orders/mobile-kds.ts`: stage/lane selection, stable sorting, counters.
- `src/app/merchant/orders/mobile-kds-board.tsx`: mobile board and fixed tabs.
- `src/app/merchant/orders/terminal-client.tsx`: mobile shell, menu routing.
- `src/app/merchant/orders/terminal-detail.tsx`: mobile card wrapping existing
  payment/status/reprint handlers.
- `src/app/merchant/orders/kitchen-clock.tsx`: compact editable countdown ring.
- `src/app/merchant/orders/kds-menu.tsx`: responsive navigation and read-only
  existing location opening hours.
- `src/app/merchant/orders/kds-english.json`: mobile Danish/English strings.

## Testing and release

Run without GitHub Actions:

```bash
npm run typecheck
npm run build
node --test tests/unit/kds-mobile-board.cjs
CART_CHROMIUM_PATH=/path/to/chromium node --test tests/unit/order-terminal-browser.cjs
node --test tests/unit/terminal-read.cjs tests/unit/terminal-status.cjs \
  tests/unit/terminal-ready-time.cjs tests/unit/terminal-events.cjs \
  tests/unit/kds-scope.cjs tests/unit/kds-employee-access.cjs
```

The browser suite adds synthetic mobile 390x844 acceptance for the three
stages, the ready courier lane, mobile drawer/store hours, status actions,
ready-time editor and suspended audio. It also covers desktop 1024x768.
Do not call the release QA-passed unless the actual commands run green.

After approved merge, Firebase rollout and read-only live SHA verification,
test on the Esmeralda kitchen device: new order, preparation, Ready, Wolt Drive
pickup/delivery, audio activation, preorder, history and a print recheck. Never
create synthetic paid production orders during unattended verification.

No changes to Firestore schema/indexes, campaign settings, terminal credentials,
financial settlement, device print queues or production configuration.

## Mobile menu and history refinement

History has an immediate single-day date picker, defaults to today in Danish
time, and a Today shortcut. Orders appear as divided rows grouped by order
date, with number, customer, time, status/payment and amount. There is no items
filter. Desktop keeps its search/date-range form and compact table. Existing
authorization, pagination, totals and reprint callbacks are reused.

Settings provides an opt-in repeat-new-order alarm, saved on this device. It
plays every 30 seconds while a Received order is released to the kitchen and
data is fresh, audio is enabled and the kitchen is awake. Starting preparation
stops this reminder; muted, zero-volume, blocked-audio and stale states suppress
it. It adds no server requests. Existing delayed-order alerts remain separate.

Browser coverage includes compact mobile navigation, nested settings/back
navigation, history date API parameters, repeat-alarm persistence and stopping
after preparation. Physical iOS sound output still requires a device check.


## Device defaults, alert recovery and direct reprints (8 November)

- Automatic refresh defaults off when there is no saved preference. An explicit
  saved true/false choice remains respected. Initial load, manual Refresh and
  own order actions still read data; idle timers/focus/push do not fetch in
  manual mode. Newly discovered orders sound when the operator refreshes.
- All inline order cards start collapsed, including Received and In Progress
  on mobile. The existing expand button shows the details.
- When an alert finds a suspended/interrupted AudioContext it tries resume,
  bounded to three seconds, before playing. A blocked resume shows activation
  guidance; it does not claim playback succeeded. Existing test/mute/volume
  settings remain shared with automatic alerts. Physical iOS verification is
  still necessary for actual speaker output and browser autoplay restrictions.
- KDS Genprint directly requests a kitchen copy through the existing authorized
  manual-print endpoint. No customer receipt selector or confirmation dialog.
  Printer discovery happens on the tap, never for every card on render. Exactly
  one active authorized printer is required; ambiguous/missing configuration
  fails visibly rather than guessing a physical destination.
- An uncertain print retains its request UUID for retry. A queued/unknown print
  offers status refresh, not another write; a confirmed/failed/expired result
  allows another deliberate copy. No print polling runs in the background.
  History uses the same direct kitchen action; generic merchant/admin receipt
  controls retain their existing choices and confirmations.
