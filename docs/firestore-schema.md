# Firestore Schema (Orderfly)

## Collection: products
**DocId**: `<string>` (auto-generated)

**Fields**
- `id`: string (docId, redundans)
- `brandId`: string
- `locationIds`: string[]
- `categoryId`: string
- `productName`: string
- `description`: string (optional)
- `price`: number
- `priceDelivery`: number (optional)
- `imageUrl`: string (optional, URL)
- `isActive`: boolean
- `isFeatured`: boolean (optional)
- `isNew`: boolean (optional)
- `isPopular`: boolean (optional)
- `allergenIds`: string[] (optional)
- `toppingGroupIds`: string[] (optional)
- `sortOrder`: number (optional)
- `createdAt`: timestamp
- `updatedAt`: timestamp

## Collection: feedbackQuestionsVersion
**DocId**: `<string>` (auto-generated)

**Fields**
- `id`: string (docId, redundans)
- `versionLabel`: string
- `isActive`: boolean
- `language`: string (fx 'da', 'en')
- `orderTypes`: string[] ('pickup'|'delivery')
- `questions`: Question[] (se `src/lib/schemas/feedback.ts` for detaljer)
- `createdAt`: timestamp
- `updatedAt`: timestamp

**Indexes Anbefalet**
- `products` orderBy `sortOrder` asc
- `feedbackQuestionsVersion` orderBy `updatedAt` desc
