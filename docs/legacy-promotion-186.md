# Legacy promotion details (#186)

Discount and standard-discount documents predate the current forms. Their dates
may be Firestore timestamps, ISO strings, or serialized timestamp objects;
optional form fields may be absent. Read paths normalize these representations
before rendering. Missing day/time restrictions retain the checkout meaning of
no restriction, and edit forms supply defaults for absent optional fields.

The write actions retain unknown stored fields and usage counters on edit. No
bulk migration or production record change is required. An absent description
is accepted when an old code is saved. A malformed date is omitted from the
form instead of throwing during server rendering. An edit preserves an
unrecognized stored date for explicit administrative review; a user clearing
a visible date sends a separate clear instruction. No hidden legacy date is
silently erased on save.

`node --test tests/unit/legacy-promotion-details.cjs` exercises the three
document IDs named by QA with historical field variants, read and edit paths,
and preservation of usage, schedule, scope and product configuration. These
fixtures are reconstructed variants, not exports of live Firestore documents.
After an approved deployment, inspect the actual `SUMMER20`, newsletter signup
and `Pizza Pizza` documents in signed-in Superadmin before saving changes.
