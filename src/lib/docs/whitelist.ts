// src/lib/docs/whitelist.ts
export const DOCS_DIR = "design/m3-figma-export/guidelines";

export const DOC_WHITELIST = [
  "Guidelines.md",
] as const;

export type DocName = (typeof DOC_WHITELIST)[number];

export function isAllowedDoc(name: string): name is DocName {
  return (DOC_WHITELIST as readonly string[]).includes(name);
}
