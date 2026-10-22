/** Public wire shape only. This is an attribution hint, never an authentication token. */
export const QR_TOUCH_QUERY = 'qr_touch';
export const QR_TOUCH_WINDOW_MS = 30 * 60_000;
export const QR_TOUCH_RECEIPT_PATTERN = /^[a-f0-9]{32}\.[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}\.[a-f0-9]{64}$/;
