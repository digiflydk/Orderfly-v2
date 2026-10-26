# Delivery quote binding

The internal quotes/binding helper fingerprints authoritative scope, checkout, normalized address, item digest, requested time and both settings revisions. It does not authorize a public request or read a persisted quote. Callers must obtain trusted server input and validate stored schema before calling. Quotes have a bounded local TTL even if the provider omits expiry; the earliest expiry wins. Exact expiration and any scope/cart/settings change invalidate acceptance. Customer fee acceptance must match exactly.

The helper copies economic snapshots; it does not persist quotes or initiate payments. Full provider fulfillment data, durable quote storage and checkout integration remain separate prerequisites. Route provenance validation is not proof of a real route provider. No customer-facing feature is enabled by this helper.
