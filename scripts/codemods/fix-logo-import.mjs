import { globby } from "globby";
import fs from "node:fs/promises";

const files = await globby(["src/**/*.{ts,tsx}"]);

for (const f of files) {
  let s = await fs.readFile(f, "utf8");
  const o = s;

  // Skift alle relative SiteLogo imports til alias
  s = s.replace(
    /import\s+SiteLogo\s+from\s+["'](?:\.\.\/)+common\/SiteLogo["'];?/g,
    'import SiteLogo from "@/components/common/SiteLogo";'
  );

  if (s !== o) {
    await fs.writeFile(f, s, "utf8");
    console.log(`[FixLogoImport] ${f}`);
  }
}
