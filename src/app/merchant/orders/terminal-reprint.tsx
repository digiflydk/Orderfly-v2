'use client';
import { ReprintControls } from '@/components/receipts/reprint-controls';

/** Both controls stay mounted, retaining independent request identities when collapsed. */
export function TerminalReprint(props: { orderId: string; brandId: string; locationId: string }) {
  return <div className="space-y-3" aria-label="Genprint ordre">
    <p className="text-sm text-muted-foreground">Vælg bon. Du bliver bedt om at bekræfte, før der sendes en ekstra kopi.</p>
    <details className="rounded-xl border p-3"><summary className="min-h-11 cursor-pointer py-2 font-semibold">Køkkenbon</summary>
      <ReprintControls {...props} kind="kitchen" merchant />
    </details>
    <details className="rounded-xl border p-3"><summary className="min-h-11 cursor-pointer py-2 font-semibold">Kundekvittering</summary>
      <ReprintControls {...props} kind="customer" merchant />
    </details>
  </div>;
}
