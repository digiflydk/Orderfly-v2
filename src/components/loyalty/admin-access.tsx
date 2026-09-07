'use client';
import { useCallback, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import type { User } from 'firebase/auth';
import { LoyaltyAuth } from './auth-panel';
import { openFinancialAdminSession, closeFinancialAdminSession } from '@/app/loyalty/admin-session-actions';
import { Button } from '@/components/ui/button';

export function FinancialAdminAccess({ active }: { active: boolean }) {
  const [user, setUser] = useState<User | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  useEffect(() => { const refresh = () => router.refresh(); window.addEventListener("financial-admin-logout", refresh); return () => window.removeEventListener("financial-admin-logout", refresh); }, [router]);
  const onUser = useCallback((next: User | null) => { setUser(next); }, []);
  return <details className="mb-4 rounded-lg border p-4" open={!active}>
    <summary>Administratoradgang til kunder, ordrer og betaling: {active ? 'bekræftet' : 'log ind'}</summary>
    <p className="my-2">Bekræft adgangen med din godkendte konto. Godkendelsen gælder i 15 minutter.</p>
    <LoyaltyAuth onUser={onUser} />
    <div className="mt-3 flex gap-2">
      <Button type="button" disabled={!user || busy} onClick={async () => {
        setBusy(true); setMessage('');
        try { await openFinancialAdminSession(await user!.getIdToken()); router.refresh(); setMessage('Administratoradgang bekræftet.'); }
        catch (e) { setMessage(e instanceof Error ? e.message : 'Adgang afvist.'); }
        finally { setBusy(false); }
      }}>Bekræft administratoradgang</Button>
      {active && <Button type="button" variant="outline" disabled={busy} onClick={async () => {
        await closeFinancialAdminSession(); router.refresh();
      }}>Afslut administratoradgang</Button>}
    </div>
    {message && <p role="status">{message}</p>}
  </details>;
}
