import fs from 'node:fs/promises';
import path from 'node:path';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { requirePlatformSuperuser } from '@/lib/access/orderfly-session';
export default async function BrandWebsiteDocs() {
  await requirePlatformSuperuser();
  const markdown = await fs.readFile(path.join(process.cwd(), 'docs/standard-takeaway-website.md'), 'utf8');
  return <article className="prose max-w-none"><ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown></article>;
}
