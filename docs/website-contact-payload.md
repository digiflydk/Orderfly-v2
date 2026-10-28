# Contact payload adapter — Website #46

The packaged `/kontakt` form now uses the separately reviewed contact adapter
instead of native GET/Webflow submission. This is **not an activation**: the
captured key is removed, no replacement key or enabled flag is supplied, and the
submit control starts disabled. Without JavaScript it remains disabled and uses
POST; the serving CSP still denies native form actions. With JavaScript the
adapter captures submit before Webflow and reports that telephone contact is
available until configuration is deliberately supplied.

`scripts/preview-contact.py` targets only original element
`6f9737ee-d6c8-8a30-938d-d30bd92e6335`. It removes that form's Webflow page/element
and Turnstile metadata and action, sets POST and `data-website-contact`, and
disables its submit. The message label now targets its existing contact-message
textarea ID, correcting the captured Visitors mismatch. The duplicate `email-form` cookie-settings form is untouched.
One synchronous local adapter script is inserted first in the head; all original
scripts retain their bytes and order. Ambiguous or missing targets fail packaging.

The immutable v8 inventory remains 104 pages and 269 assets, with original
manifest SHA256 `d4461a074d59ab035e005035ed9aa33e64327a6cff26d953ac7c680a60afd4fc`.
The source is validated before either navigation or contact transformations.
The packaged inventory has 375 routes: 104 HTML, the 269 original assets, one
explicitly added adapter, and robots. The existing legacy HTML route still
redirects at runtime. `added_assets` records the addition independently of the
original source inventory; `page_patches./kontakt.contact_adapter_version=1`
records the contact transformation. Hashes:

| Item | SHA256 |
|---|---|
| Original kontakt.html | `511d5f2a257d280f4776e50ff84530d42467ebf25e1fd700dd5c911835ec8613` |
| Transformed /kontakt | `92bb68e5b779ae591baaaf4e108d0ff5345e72a59118807a962e6f277e68182a` |
| Added adapter | `eb6ec999568ddea7e312638f3c46bdc58672cbe6566fd1569ce856953acd3ef9` |
| Compressed payload | `9493a656d2451ed65be6dfd5e59c43951657d798451962064fcf486b52280653` |

Adapter source: `preview/esmeralda/adapters/website-contact-adapter.js`, vendored
from the Website #46 Ops implementation. Packaging pins its exact hash. Runtime
URL: `/_assets/website-contact-adapter.js`. The adapter only enables after explicit
`data-website-contact-enabled="true"` plus an owned, nonempty
`data-website-contact-sitekey`; neither is emitted by this change.

Only the production `/kontakt` CSP permits the exact contact endpoint
`https://bdemvarwpfcxyczunchx.supabase.co/functions/v1/website-contact` and
Cloudflare's Turnstile script path/frame/connect origin. Other public paths and
the offline preview policy retain their existing restrictions. CSP permission
does not enable the adapter or backend. The adapter requests Turnstile only after
configuration, uses action `website_contact`, omits credentials, rejects
redirects, and retains the same idempotency key for retries of unchanged data.

Release remains blocked on independent current-head reviews, configured/accepted
backend and CAPTCHA ownership/bindings, scoped live browser success/error/retry
QA and controlled email acceptance. This change sends no real email and changes
no DNS, secrets, production data, or release switch. Synthetic DOM adapter tests
belong to the upstream implementation; Python packaging tests, local unit/server
tests and production build/typecheck are separate from browser/live acceptance.
