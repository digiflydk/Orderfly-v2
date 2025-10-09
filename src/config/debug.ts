export const DEBUG_ENABLED = process.env.DEBUG_ENABLED === "true";
export const DEBUG_MAX_DOCS = 50;
export const DEBUG_DEFAULT_PAGE_SIZE = 20;
export const DEBUG_COLLECTIONS = [
  "brands",
  "locations",
  "products",
  "orders",
  "customers",
  "feedback",
  "settings",
  "settings/general",
  "website/header",
  "website/footer",
  "website/sections"
];
export const DEBUG_MASK_FIELDS = [
  "email","phone","address","token","payment","card","password","secret","apiKey","session"
];
export function getDebugToken() { return process.env.DEBUG_TOKEN || ""; }
export function isProd() { return process.env.NODE_ENV === "production"; }
