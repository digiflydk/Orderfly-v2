// Template text with its placeholders and conditional markers set off, read-only.
export function TemplateText({ text }: { text: string }) {
  return (
    <div className="whitespace-pre-line rounded-md border p-3 text-sm leading-relaxed">
      {text.split(/(\{[^{}\n]+\})/).map((part, i) => i % 2 ? <code key={i} className="rounded bg-muted px-1 text-xs">{part}</code> : part)}
    </div>
  );
}
