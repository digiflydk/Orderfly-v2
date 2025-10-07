
#!/usr/bin/env node
import { globby } from 'globby';
import fs from 'node:fs/promises';

const files = await globby(['src/app/**/*.tsx', 'src/app/**/*.ts']);
const offenders = [];

for (const f of files) {
  const txt = await fs.readFile(f, 'utf8');
  // Skip client components
  if (txt.trim().startsWith("'use client'")) continue;
  
  // Use a more generic regex to catch PageProps/LayoutProps
  if (/\b(PageProps|LayoutProps)\b/.test(txt)) {
    offenders.push(f);
  }
}

if (offenders.length) {
  console.error(
    `[Guard] Forbidden PageProps/LayoutProps usage found in server components:\n` +
      offenders.map((f) => ` - ${f}`).join('\n')
  );
  process.exit(1);
}
