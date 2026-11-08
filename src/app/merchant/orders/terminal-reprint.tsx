'use client';
import { useKdsLanguage } from './kds-language';
import { ReprintControls } from '@/components/receipts/reprint-controls';

/** Both controls stay mounted, retaining independent request identities when collapsed. */
export function TerminalReprint(props: { orderId: string; brandId: string; locationId: string; apiEndpoint?: string; onAccessDenied?: () => void }) {
  const {t}=useKdsLanguage();
  return <div className="space-y-3" aria-label="Genprint ordre">
    <p className="text-sm text-muted-foreground">{t("Vælg bon. Du bliver bedt om at bekræfte, før der sendes en ekstra kopi.")}</p>
    <details className="rounded-xl border p-3"><summary className="min-h-11 cursor-pointer py-2 font-semibold">{t("Køkkenbon")}</summary>
      <ReprintControls translate={t} {...props} kind="kitchen" merchant />
    </details>
    <details className="rounded-xl border p-3"><summary className="min-h-11 cursor-pointer py-2 font-semibold">{t("Kundekvittering")}</summary>
      <ReprintControls translate={t} {...props} kind="customer" merchant />
    </details>
  </div>;
}
