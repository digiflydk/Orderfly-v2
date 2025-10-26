// src/lib/docs/whitelist.ts
export const DOCS_DIR = "docs";

export const DOC_WHITELIST = [
  "FILE-MAP.md",
  "OPERATIONS-LOG.md",
  "PM-KICKOFF-TEMPLATE.md",
  "PM-ONEPAGER.md",
  "TROUBLESHOOTING-QUICK.md",
  "api-overview.md",
  "architecture.md", // <-- ADDED
  "data-flow.md",
  "firestore-schema.md",
] as const;

export type DocName = (typeof DOC_WHITELIST)[number];

export function isAllowedDoc(name: string): name is DocName {
  return (DOC_WHITELIST as readonly string[]).includes(name);
}
