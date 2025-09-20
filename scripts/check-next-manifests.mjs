import { existsSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const candidates = [
  ".next/server/app/client-reference-manifest.json",
  ".next/server/app/client-reference-manifest.js",
  ".next/server/app/route-module-manifest.json",
];

const missing = candidates.filter((p) => !existsSync(path.join(ROOT, p)));

if (missing.length === candidates.length) {
  console.error("ERROR: Next client/route manifests missing after build.");
  console.error("Checked:", candidates.join(", "));
  process.exit(1);
} else {
  console.log("OK: Next manifests present.");
}
