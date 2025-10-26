// src/lib/docs/whitelist.ts
export const DOCS_DIR = "docs";

export const DOC_WHITELIST = [
  "README.md",
  "FILE-MAP.md",
  "OPERATIONS-LOG.md",
  "PM-KICKOFF-TEMPLATE.md",
  "PM-ONEPAGER.md",
  "TROUBLESHOOTING-QUICK.md",
  "api-overview.md",
  "architecture.md",
  "data-flow.md",
  "data-communication.md",
  "firestore-collections-overview.md",
  "firestore-schema.md",
  "performance-indexes.md",
  "security-rbac.md",
] as const;

export type DocName = (typeof DOC_WHITELIST)[number];

export function isAllowedDoc(name: string): name is DocName {
  return (DOC_WHITELIST as readonly string[]).includes(name);
}
