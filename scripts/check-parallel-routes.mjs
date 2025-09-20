#!/usr/bin/env node
/**
 * Check for parallel/duplicate routes that resolve to the same path in Next.js App Router.
 * We “normalize” route paths by removing the optional route group “(public)/”.
 * If duplicates exist (e.g. /(public)/[brandSlug]/page.tsx and /[brandSlug]/page.tsx),
 * we fail the build with a clear error message.
 */

import { readdirSync, statSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const APP_DIR = path.join(ROOT, "src", "app");

// file extensions that represent route “pages” (add more if needed)
const PAGE_FILES = new Set(["page.tsx", "page.ts", "route.ts", "layout.tsx", "layout.ts"]);

/** Recursively collect route files under src/app */
function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      out.push(...walk(full));
    } else {
      out.push(full);
    }
  }
  return out;
}

/** Convert absolute file path to app-relative, POSIX-like path */
function toAppRel(abs) {
  return abs.replace(APP_DIR + path.sep, "").split(path.sep).join("/");
}

/** Normalize route key by stripping an initial “(public)/” group if present */
function normalizeRouteKey(appRelPath) {
  // we only care about files that define a route or layout
  const parts = appRelPath.split("/");
  const file = parts[parts.length - 1];
  if (!PAGE_FILES.has(file)) return null;

  // drop route group "(public)" from the first segment if present
  let normalized = appRelPath;
  if (normalized.startsWith("(public)/")) {
    normalized = normalized.replace(/^\(public\)\//, "");
  }
  return normalized;
}

function main() {
  try {
    // if src/app doesn’t exist, nothing to check
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

      if (!seen.has(norm)) {
        seen.set(norm, [rel]);
      } else {
        const arr = seen.get(norm);
        arr.push(rel);
        seen.set(norm, arr);
      }
    }

    for (const [norm, arr] of seen.entries()) {
      // A collision exists if more than 1 physical file normalizes to the same route key
      if (arr.length > 1) {
        collisions.push({ route: norm, files: arr });
      }
    }

    if (collisions.length > 0) {
      console.error("✖ Parallel/duplicate routes detected (these resolve to the same path):");
      for (const c of collisions) {
        console.error(`  Route: /${c.route}`);
        for (const f of c.files) console.error(`    - src/app/${f}`);
      }
      console.error("\nFix: Remove one of the duplicates so only a single file maps to each route path.");
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
