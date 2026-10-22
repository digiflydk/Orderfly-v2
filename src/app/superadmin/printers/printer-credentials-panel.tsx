'use client';

import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { Button } from '@/components/ui/button';
import { createCredentialController, credentialOperationAllowed, type CredentialScope, type CredentialOperation } from './printer-credentials-client';
import { PrinterPilotControls } from './pilot-controls';
import { PrinterPilotAddress } from './printer-pilot-address';

const labels: Record<CredentialOperation, string> = { issue: 'Opret printeradgang', rotate: 'Erstat adgangskode', revoke: 'Tilbagekald printeradgang' };
const states = { missing: 'Ikke oprettet', current: 'Oprettet', revoked: 'Tilbagekaldt', stale: 'Printeren er ændret. Adgangskoden skal erstattes.' };

/** Mounted only for the row's authorized superadmin scope; no output activation. */
export function PrinterCredentialsPanel({ scope, printerName, permitted, onSessionLost, onClose, pilotProfile }: {
  scope: CredentialScope; printerName: string; permitted: boolean; onSessionLost: () => void; onClose: () => void;
  pilotProfile?: { model: 'mc-print2' | 'mc-print3'; paperWidthMm: 58 | 80; transport: 'cloudprnt-http' | 'cloudprnt-mqtt'; state: 'active' | 'paused' | 'disabled' };
}) {
  const sessionLost = useRef(onSessionLost); sessionLost.current = onSessionLost;
  const controller = useMemo(() => createCredentialController({ brandId: scope.brandId, locationId: scope.locationId,
    printerId: scope.printerId, printerRevision: scope.printerRevision }, permitted, () => sessionLost.current()),
  [scope.brandId, scope.locationId, scope.printerId, scope.printerRevision, permitted]);
  const view = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  useEffect(() => { controller.activate(); void controller.refresh(); return controller.dispose; }, [controller]);
  const busy = view.phase === 'loading' || view.phase === 'writing';
  const close = () => { controller.dispose(); onClose(); };
  return <section role="dialog" aria-modal="false" aria-label="Printeradgang" className="rounded-lg border bg-card p-4 space-y-4 min-w-0">
    <h2 className="text-lg font-semibold">Printeradgang: {printerName}</h2>
    <p className="text-sm text-muted-foreground">Adgangskoden forbinder printeren med Orderfly. Denne handling aktiverer ikke printeren eller udskriver noget.</p>
    {!permitted && <p role="alert">Du har ikke adgang til printeradgang for denne række.</p>}
    {busy && <p role="status">{view.phase === 'loading' ? 'Indlæser status…' : 'Afventer bekræftelse…'}</p>}
    {view.message && <p role={view.phase === 'error' ? 'alert' : 'status'}>{view.message}</p>}
    {view.metadata && <p>Status: {states[view.metadata.state]}</p>}
    {permitted && pilotProfile?.transport === 'cloudprnt-http' && <PrinterPilotAddress scope={scope} showUsername={view.phase !== 'secret'} />}
    {view.phase === 'confirm' && view.operation && <div className="space-y-3">
      <p>{view.operation === 'issue' ? 'Opret en ny adgangskode til denne printer?' : view.operation === 'rotate'
        ? 'Den tidligere adgangskode stopper med at virke. Erstat den med en ny kode?' : 'Printeren mister sin adgang. Tilbagekald adgangskoden?'}</p>
      <div className="flex flex-wrap gap-3"><Button onClick={() => void controller.confirm()}>{labels[view.operation]}</Button>
        <Button variant="outline" onClick={controller.cancel}>Annuller</Button></div>
    </div>}
    {view.phase === 'secret' && view.secret && <div className="space-y-3">
      <p>Gem koden i printerens opsætning nu. Den kan ikke vises igen, når du skjuler den eller lukker panelet.</p>
      <p>Brugernavn: <code>orderfly</code></p>
      <p>Adgangskode: <code className="break-all select-all" aria-label="Engangsvist adgangskode">{view.secret}</code></p>
      <Button onClick={controller.dismissSecret}>Skjul koden</Button>
    </div>}
    {view.phase === 'ready' && view.metadata && permitted && <div className="flex flex-wrap gap-3">
      {(['issue', 'rotate', 'revoke'] as const).filter(op => credentialOperationAllowed(view.metadata!, op)).map(op =>
        <Button key={op} variant={op === 'revoke' ? 'outline' : 'default'} onClick={() => controller.select(op)}>{labels[op]}</Button>)}
    </div>}
    {view.phase === 'ready' && view.metadata?.state === 'current' && permitted && pilotProfile?.transport === 'cloudprnt-http' && <PrinterPilotControls
      key={JSON.stringify([scope.brandId, scope.locationId, scope.printerId, scope.printerRevision, view.metadata.credentialRevision])}
      scope={{ ...scope, credentialRevision: view.metadata.credentialRevision }} model={pilotProfile.model} paperWidthMm={pilotProfile.paperWidthMm}
      active={pilotProfile.state === 'active'} permitted={permitted} onSessionLost={onSessionLost} />}
    <div className="flex flex-wrap gap-3">
      {permitted && !busy && view.phase !== 'confirm' && view.phase !== 'secret' && <Button variant="outline" onClick={() => void controller.refresh()}>Indlæs status</Button>}
      <Button variant="outline" disabled={view.phase === 'writing'} onClick={close}>Luk</Button>
    </div>
  </section>;
}
