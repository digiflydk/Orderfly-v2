// src/components/superadmin/docs/DocsMarkdown.tsx
import fs from 'fs';
import path from 'path';
import { marked } from 'marked';

type Props = {
  filename: string;
};

export default async function DocsMarkdown({ filename }: Props) {
  const docsDir = path.join(process.cwd(), 'developer', 'docs');
  const fullPath = path.join(docsDir, filename);

  let content = '';

  try {
    content = await fs.promises.readFile(fullPath, 'utf8');
  } catch (err) {
    return (
      <div className="text-sm text-red-600">
        Document not found: <code>{filename}</code>
      </div>
    );
  }

  const html = marked.parse(content);

  return (
    <div
      className="prose prose-sm max-w-none"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
