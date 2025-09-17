
export const DEBUG_MAX_DOCS = 25
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
]
export function getDebugToken() {
  return process.env.DEBUG_TOKEN || ""
}
