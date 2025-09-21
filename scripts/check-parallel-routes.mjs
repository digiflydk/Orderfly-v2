/**
 * Detect parallel/duplicate routes in Next.js App Router.
 * We normalize route keys by stripping ANY leading route groups "(group)/".
 * If multiple files normalize to the same key (e.g. /(public)/page.tsx and /page.tsx),
 * we fail the build with a clear error.
 */

import { readdirSync, statSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const APP_DIR = path.join(ROOT, "src", "app");

// Files that define routes/layouts we care about
const PAGE_FILES = new Set(["page.tsx", "page.ts", "route.ts", "layout.tsx", "layout.ts"]);

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

function toAppRel(abs) {
  return abs.replace(APP_DIR + path.sep, "").split(path.sep).join("/");
}

/** Strip ANY number of leading "(group)/" segments */
function stripLeadingGroups(p) {
  let out = p;
  while (out.startsWith("(")) {
    const idx = out.indexOf(")/");
    if (idx === -1) break;
    if (out.slice(0, idx + 2).startsWith("(")) out = out.slice(idx + 2);
    else break;
  }
  return out;
}

function normalizeRouteKey(appRelPath) {
  const parts = appRelPath.split("/");
  const file = parts[parts.length - 1];
  if (!PAGE_FILES.has(file)) return null;
  return stripLeadingGroups(appRelPath);
}

function main() {
  try {
    try {
      statSync(APP_DIR);
    } catch {
      console.log("[check-parallel-routes] No src/app directory found. OK.");
      process.exit(0);
    }

    const files = walk(APP_DIR).map(toAppRel).filter(Boolean);
    const seen = new Map(); // normalizedKey -> [originalPaths]
    const collisions = [];

    for (const rel of files) {
      const norm = normalizeRouteKey(rel);
      if (!norm) continue;
      if (!seen.has(norm)) seen.set(norm, [rel]);
      else seen.get(norm).push(rel);
    }

    for (const [norm, arr] of seen.entries()) {
      if (arr.length > 1) collisions.push({ route: norm, files: arr });
    }

    if (collisions.length > 0) {
      console.error("✖ Parallel/duplicate routes detected (these resolve to the same path):");
      for (const c of collisions) {
        console.error(`  Route: /${c.route}`);
        for (const f of c.files) console.error(`    - src/app/${f}`);
      }
      console.error("\nFix: Keep only ONE physical file per normalized route key. Move archive files outside src/app/.");
      process.exit(1);
    }

    console.log("✔ No parallel/duplicate routes detected.");
    process.exit(0);
  } catch (e) {
    console.error("✖ check-parallel-routes failed unexpectedly:", e?.message || e);
    process.exit(1);
  }
}

main();
