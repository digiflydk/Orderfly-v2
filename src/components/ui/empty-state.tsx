// src/components/ui/empty-state.tsx
"use client";

export default function EmptyState({
  title,
  hint,
  details,
  actions,
}: {
  title: string;
  hint?: string;
  details?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-2xl p-6 text-center">
      <h2 className="text-xl font-semibold">{title}</h2>
      {hint ? <p className="mt-2 text-sm opacity-80">{hint}</p> : null}
      {details ? (
        <pre className="mt-4 text-left text-xs bg-black/5 p-3 rounded overflow-auto max-h-60">
          {details}
        </pre>
      ) : null}
      {actions ? <div className="mt-4 flex items-center justify-center gap-3">{actions}</div> : null}
    </div>
  );
}
