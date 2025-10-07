
import { globby } from "globby";
import fs from "node:fs/promises";

const files = await globby(["src/**/*.{ts,tsx}"]);

for (const f of files) {
  let s = await fs.readFile(f, "utf8");
  const o = s;

  // Ensret logo-import (footer/header/layouts m.fl.)
  s = s.replace(
    /import\s+SiteLogo\s+from\s+["'](\.\.\/)+common\/SiteLogo["'];?/g,
    'import SiteLogo from "@/components/common/SiteLogo";'
  );

  // Skub relative superadmin-imports over på alias (almindelige cases)
  s = s.replace(
    /from\s+["']\.\.\/superadmin\/brands\/actions["']/g,
    'from "@/app/superadmin/brands/actions"'
  );
  s = s.replace(
    /from\s+["']\.\.\/superadmin\/locations\/actions["']/g,
    'from "@/app/superadmin/locations/actions"'
  );

  if (s !== o) {
    await fs.writeFile(f, s, "utf8");
    console.log(`[FixImportsLogo] ${f}`);
  }
}
