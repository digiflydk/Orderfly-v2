# Feedback replies and conversation thread (#901)

Staff can answer a guest's feedback by email and keep the whole conversation on the feedback and on the customer. The PM approved the design on 2026-11-10.

## Staff flow (feedback detail page)

- **Card:** "Svar til kunden" shows the conversation, a reply box, "Gem kladde", "Godkend og send", "Slet kladde" and "Luk/Genåbn samtale".
- **Access:** sending requires `feedback:edit` for the feedback's brand, which covers superadmin and merchant staff with that right. Viewers see the thread with disabled controls.
- **Approval:** sending requires the explicit approval checkbox. Editing the text clears it, so the text sent is exactly the text approved.
- **Recipient:** resolved on the server and never taken from the client.
  - Online orders and bookings use the customer record's e-mail.
  - Dully uses the Dully source's e-mail.
  - Dine-in (QR) feedback is anonymous and cannot be answered.
  - The UI shows the address masked.
- **Delivery:** the mail is sent immediately through the Notification Platform template `orderfly.feedback.reply` (esmeralda-restaurant-operations #445/#446) with idempotency key `feedback-reply:<message id>`.
  - An uncertain provider result is stored as `uncertain` and is never retried automatically.
  - Sending works once that template is deployed; before then the platform rejects the key and the message is stored as `failed`.
- **Text:** the Esmeralda mail layout adds its own sign-off, so replies should not end with one. Only promise what has already been done; refunds happen in Dully or Stripe, not in Orderfly.

## Drafts by Claude

Once a day at 12:00 (Copenhagen), Claude reads new feedback with a comment or a low score and saves a draft with `origin: 'assistant'`. The UI labels it "Kladde fra Claude".

A draft is never sent by Claude: a person with `feedback:edit` must read, adjust and approve it. Each thread has one current draft.

## Guest reply page

- **Link:** the mail links to `https://orderfly.dk/feedback/reply#token=<64 hex>`. The token is in the URL fragment, which is not sent to the server, logs or analytics.
- **Token storage:** each staff reply issues a new token, valid for 90 days. Only SHA-256 hashes are stored (`tokens`/`tokenHashes`, at most the 5 newest).
- **Closing:** closing the thread removes all hashes, so every link stops working at once.
- **Page:** the guest sees the conversation text only (no staff identities or states) and can answer up to 2000 characters. There are at most 10 guest messages per thread per 24 hours. The page is not indexed and sends no referrer.
- **Admin notice:** a guest message notifies the brand's feedback admin through `orderfly.feedback.customer_reply`. This uses the `ORDERFLY_FEEDBACK_ADMIN_NOTIFICATIONS` binding and is best effort: the message is stored even if the notice fails.
- **Direct replies:** a reply sent directly to the email reaches the organization's reply-to address, not the thread. Inbound email is out of scope.

## Data

- **`feedbackReplyThreads/{feedbackId}`:** brandId, locationId, customerId, status (open/closed), token hashes and timestamps.
- **`feedbackReplyMessages/{64 hex}`:** feedbackId, brandId, direction (staff/guest), body, state, origin, draftedBy, approvedBy and timestamps.
  - Staff states: draft, sending, sent, failed, uncertain.
  - Guest state: received.
- **Indexes:** queries use single equality filters, so no composite index is needed.
- **Customer page:** the card "Samtaler om feedback" lists the threads for the customer's feedback, for readers with feedback access. Customer feedback history now also includes Dully feedback, matched by the customer record's e-mail addresses (primary and aliases) within the same brand.
