# Location terminal login settings (#640 / #641)

Saved locations expose a separate **Terminal-login** card below the existing location form. New, unsaved locations do not have credential controls. The card reads and writes `/api/superadmin/locations/{locationId}/terminal-login` using the existing authenticated admin session. The endpoint decides read/edit permission and authoritative location ownership.

The card is deliberately outside the location form and its React Hook Form recovery provider. Username/password are not added to the public location model, ordinary save action, form recovery, localStorage or sessionStorage. The password is write-only, uses a new-password input, and is cleared on submission, response, status reload and location changes. It is never recovered for retry or shown from server data. Password-manager behavior is controlled by the browser/user, not by application persistence.

The settings metadata includes configured/enabled/username/revision/canEdit only. Initial setup requires a12–128 character password and a normalized3–64 character username. Later saves may omit the password to retain it; a supplied new password resets it. Every change warns that existing terminal sessions are logged out. Disabling has an explicit confirmation, uses the saved username/revision, and never submits an unrelated unsaved password draft. Read-only users cannot submit changes.

Saving uses PUT with expectedRevision. Conflicts, expired/forbidden sessions and uncertain network results have safe local messages, not arbitrary backend strings. A failed or ambiguous mutation clears the password and disables further writes until an explicit successful GET reloads current metadata; there is no automatic credential-mutation retry. Overlapping clicks are excluded. Location changes abort/discard stale reads and writes without claiming that an already-sent write was rolled back.

The `/terminal/login` link opens the dedicated portal. Configuring arbitrary production credentials, changing a live location, logging in a physical iPad, and proving physical persistent sessions are outside local fixture tests and require the parent release acceptance.

## Local validation

`CART_CHROMIUM_PATH=<local chromium> node --test tests/unit/location-terminal-login-browser.cjs` mounts the real React component and intercepts only the HTTP endpoint. It covers initial loading, configure/retain/reset, no browser-storage secret writes, disable confirmation, expected revision, conflicts/503 with required metadata reload, read-only/401, and location change during an uncertain write. `npm run typecheck` validates the actual saved-location integration. These tests do not execute GitHub Actions or mutate production credentials.
