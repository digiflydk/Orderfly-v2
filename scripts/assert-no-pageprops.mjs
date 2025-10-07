
import { globby } from 'globby';
import fs from 'node:fs/promises';

async function main() {
  const files = await globby(['src/app/**/*.tsx', 'src/app/**/*.ts']);
  const offenders = [];

  for (const file of files) {
    const content = await fs.readFile(file, 'utf8');
    if (/^\s*["']use client["']/.test(content.slice(0, 200))) {
      continue;
    }
    if (/\b(PageProps|LayoutProps)\b/.test(content)) {
      offenders.push(file);
    }
  }

  if (offenders.length > 0) {
    console.error(
      `[Guard][FEJL] Forbidden PageProps/LayoutProps usage found in the following files:\n` +
      offenders.map((f) => ` - ${f}`).join('\n')
    );
    process.exit(1);
  }

  console.log('[Guard] No forbidden PageProps/LayoutProps usage found. OK.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
