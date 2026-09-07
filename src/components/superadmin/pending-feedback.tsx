import { Loader2 } from 'lucide-react';

export function PendingFeedback({ label = 'Indlæser…' }: { label?: string }) {
  return (
    <span role="status" aria-live="polite" className="pointer-events-none fixed bottom-6 left-1/2 z-[100] flex -translate-x-1/2 items-center gap-3 rounded-lg border bg-background px-5 py-3 text-sm text-foreground shadow-lg">
      <Loader2 aria-hidden="true" className="h-5 w-5 animate-spin motion-reduce:animate-none" />
      {label}
    </span>
  );
}
