# Storefront menu: intermittent React #418 on repeat visits (2026-11-10)

## Observation
On release `fcbafd5`, `https://esmeralda.orderfly.dk/amager?deliveryMethod=pickup` sometimes threw
`Minified React error #418` ("Hydration failed because the server rendered HTML didn't match the client", args `HTML`).
It showed up when the same browser context loaded the menu several times. A fresh first load did not trigger it.
The `?produkt=` links were not involved.

## Root cause
The cause was not storage, cookies or clock reads during render:

- Read-only replays against production captured the HTML of a failing load and a passing load. Apart from timestamps, the HTML was identical.
- An instrumented production React chunk showed the mismatch at `BrandLayoutClient`'s `<div className="flex-1 w-full">` (`Content`) before any of its children existed. React threw from `replaySuspendedUnitOfWork` in the concurrent work loop.

The mechanism:

1. The App Router receives the route's children as a streamed React Server Components reference. That reference can stay pending after hydration starts. One example is when the `[brandSlug]/error.tsx` client chunk has not loaded yet. Another is when the location layout's row streams after the page, as it does with managed delivery, because of its extra schedule reads.
2. `Content` rendered `{children}` directly. React therefore suspended while reconciling the children of a **host element**.
3. When the Flight chunk resolved, the vendored React (`19.2.0-canary-0bdb9206-20250818`, shipped with Next 15.5.9) replayed that host element. The replay ran `beginWork` again without restoring the hydration cursor. The cursor already pointed inside the `div`, so React reported #418.

Repeat visits hydrate earlier, because the JavaScript is cached while the HTML is still streaming. That is why the race appeared only on repeat visits and only intermittently.

## Fix
`BrandLayoutClient` now renders the route content through a small component, `RouteContent`, instead of directly under `Content`.
A pending reference now suspends a component. React replays a component without touching the hydration cursor.
The markup and behavior do not change.

## Tests
`tests/unit/storefront-route-hydration-browser.cjs` covers this. It renders the real `BrandLayoutClient` on the server and hydrates it in Chromium with Next's vendored React.

- **Pending route content.** The route content is a lazy node shaped like a Flight chunk: a thenable with a status that resolves right after hydration reaches it.
- **Returning visitor.** The test seeds a returning visitor's state: `deliveryMethod`, a saved basket, `orderfly.menu-view.*`, the consent cookie and `of_location`. It then loads the menu three times in one context, the last time with an extra query parameter.
- **Assertions at 390px and 1280px.** No `pageerror`, no recoverable hydration error, and the route content appears once inside the content area.
- **Control case.** A control keeps the previous placement, with children directly under the host `div`. It must still reproduce #418, which proves the fixture exercises the real bug.

Run:

```sh
CART_CHROMIUM_PATH=/opt/pw-browsers/chromium node --test tests/unit/storefront-route-hydration-browser.cjs
```

It also runs in the "Esmeralda V2 menu, products, combos and checkout browser checks" step of `ui-tests.yml`.

## Local verification
These checks ran against a local production build with the QA0 Firestore emulator:

| Scenario | Before the fix | After the fix |
|---|---|---|
| `[brandSlug]/error` chunk delayed by 1.5s | 3 of 20 loads failed | 0 of 30 |
| Repeat-visit sequence, location layout delayed 700ms (simulating the managed-delivery reads) | Reproduced | No errors at 390px or 1280px |

The local-only changes used for these runs were reverted and are not part of the change:

- allowing the storefront in QA0 mode,
- allowing a production build in QA0 mode,
- the artificial layout delay.

## Rule
In client layouts, always render server-provided `children` through a component. Do not render them as a direct child of a host element when they can be a streamed RSC reference.

## Follow-up
After deployment, repeat the read-only observation sequence on production at 390px and 1280px with third-party requests blocked: load the menu, load it again, then load it with an extra query parameter, several times in one context.
