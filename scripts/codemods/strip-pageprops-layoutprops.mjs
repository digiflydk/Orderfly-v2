
#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";

const files = [
  "src/app/admin/analytics/page.tsx",
  "src/app/superadmin/dashboard/page.tsx",
  "src/app/superadmin/sales/dashboard/page.tsx",
  "src/app/superadmin/sales/orders/page.tsx",
];

async function run() {
  for (const f of files) {
    let s;
    try {
        s = await fs.readFile(f, "utf8");
    } catch (e) {
        console.log(`[Strip] Skipping missing file: ${f}`);
        continue;
    }
    
    let orig = s;

    // Fjern imports fra next
    s = s.replace(/import\s+type\s+{[^}]*\b(PageProps|LayoutProps)\b[^}]*}\s+from\s+["']next["'];?\n?/g, "");
    s = s.replace(/import\s+{[^}]*\b(PageProps|LayoutProps)\b[^}]*}\s+from\s+["']next["'];?\n?/g, "");

    // Erstat typeannotationer/generics
    s = s.replace(/:\s*PageProps\b/g, ": unknown");
    s = s.replace(/<\s*PageProps\s*>/g, "");
    s = s.replace(/:\s*LayoutProps\b/g, ": unknown");
    s = s.replace(/<\s*LayoutProps\s*>/g, "");

    // React.FC<PageProps>
    s = s.replace(/\bReact\.FC\s*<\s*unknown\s*>/g, "React.FC");
    s = s.replace(/\bReact\.FC\s*<\s*PageProps\s*>/g, "React.FC");

    // Ryd kommentarer med ordene helt (simpelt men effektivt)
    s = s.replace(/\/\/[^\n]*(PageProps|LayoutProps)[^\n]*\n/g, "\n");
    s = s.replace(/\/\*[\s\S]*?(PageProps|LayoutProps)[\s\S]*?\*\//g, "");

    if (s !== orig) {
      await fs.writeFile(f, s, "utf8");
      console.log(`[Strip] Cleaned ${f}`);
    }
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
