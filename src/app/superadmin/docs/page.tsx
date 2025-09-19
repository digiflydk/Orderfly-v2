import fs from "fs";
import path from "path";
import MarkdownViewer from "@/components/superadmin/docs/MarkdownViewer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "default-no-store";

export default async function DocsPage() {
  const docsDir = path.join(process.cwd(), "docs");

  const files = fs.readdirSync(docsDir).filter(f => f.endsWith(".md"));

  const docs = files.map(filename => {
    const fullPath = path.join(docsDir, filename);
    const content = fs.readFileSync(fullPath, "utf-8");
    return { filename, content };
  });

  return (
    <div className="p-8 space-y-12">
      <h1 className="text-3xl font-bold mb-6">📚 Project Documentation</h1>
      {docs.map(doc => (
        <div key={doc.filename} className="border-b pb-8">
          <h2 className="text-xl font-semibold mb-4">{doc.filename}</h2>
          <MarkdownViewer content={doc.content} />
        </div>
      ))}
    </div>
  );
}
