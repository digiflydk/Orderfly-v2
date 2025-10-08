
// src/components/ui/empty-state.tsx
"use client";
export default function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="mx-auto max-w-2xl p-6 text-center">
      <h2 className="text-xl font-semibold">{title}</h2>
      {hint ? <p className="mt-2 text-sm opacity-80">{hint}</p> : null}
    </div>
  );
}
