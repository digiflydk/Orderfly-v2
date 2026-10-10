# Database structure

Orderfly uses Firestore as the main database.

Top level collection:

- `brands`
- `locations` (global)
- `products` (global)
- `orders` (global)

The former `/api/superadmin/docs/db-structure` export is retired (410 after authorization). Consult `docs/firestore-schema.md` and `docs/firestore-collections-overview.md` in the repository.
