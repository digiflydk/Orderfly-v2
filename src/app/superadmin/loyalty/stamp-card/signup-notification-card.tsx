'use client';

import { useState, useTransition } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { signupNotificationSettingsSchema, type SignupNotificationSettings } from '@/lib/loyalty/stamp-card/signup-notification-rules';
import { saveSignupNotificationAction } from './notification-actions';

const errors: Record<string, string> = {
  invalid_settings: 'Angiv en gyldig e-mailadresse.',
  record_changed: 'Indstillingerne er ændret af en anden. Genindlæs siden og prøv igen.',
  mail_configuration_required: 'Mailafsendelse er ikke sat op for dette brand endnu.',
  forbidden: 'Kun platformens superadmin kan ændre disse indstillinger.',
  unauthorized: 'Log ind igen for at gemme indstillingerne.',
};

export function SignupNotificationCard({ brandId, brandName, initial }: {
  brandId: string; brandName: string; initial: { version: number; settings: SignupNotificationSettings; mailConfigured: boolean };
}) {
  const [settings, setSettings] = useState(initial.settings), [version, setVersion] = useState(initial.version);
  const [pending, start] = useTransition(), [message, setMessage] = useState(''), [error, setError] = useState('');
  function submit(event: React.FormEvent) {
    event.preventDefault(); setMessage(''); setError('');
    const parsed = signupNotificationSettingsSchema.safeParse(settings);
    if (!parsed.success) { setError(errors.invalid_settings); return; }
    start(async () => {
      try {
        const result = await saveSignupNotificationAction({ brandId, version, settings: parsed.data });
        if (!result.ok) { setError(errors[result.error] || 'Kunne ikke gemme. Prøv igen.'); return; }
        setVersion(result.data.version); setSettings(result.data.settings);
        setMessage(result.data.changed ? 'Notifikationsindstillingerne er gemt.' : 'Ingen ændringer.');
      } catch { setError('Kunne ikke gemme. Prøv igen.'); }
    });
  }
  return <Card>
    <CardHeader><CardTitle>E-mail ved nye Club-tilmeldinger</CardTitle>
      <CardDescription>Følg nye medlemmer hos {brandName}. Indstillingen gælder kun dette brand og ændrer ikke stempelkortets regler.</CardDescription>
    </CardHeader>
    <CardContent>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <div className="flex items-center justify-between gap-4">
          <Label htmlFor="signup-notifications-enabled">Send e-mail ved ny tilmelding</Label>
          <Switch id="signup-notifications-enabled" checked={settings.enabled} disabled={pending}
            onCheckedChange={enabled => { setSettings(s => ({ ...s, enabled })); setMessage(''); }} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="signup-notification-email">Modtagerens e-mailadresse</Label>
          <Input id="signup-notification-email" type="email" maxLength={254} autoComplete="email" value={settings.recipientEmail || ''} disabled={pending}
            onChange={e => { setSettings(s => ({ ...s, recipientEmail: e.target.value || null })); setMessage(''); }} aria-invalid={!!error} />
        </div>
        <p className="text-sm text-muted-foreground">Du får én besked pr. nyt medlemskab med brand, tidspunkt og et link til medlemmet i superadmin. Login og gentagne tilmeldinger giver ikke ekstra beskeder. Tidligere tilmeldinger sendes ikke.</p>
        {!initial.mailConfigured && <p className="text-sm text-muted-foreground">Mailafsendelse skal sættes op for dette brand, før notifikationer kan aktiveres.</p>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {message && <p role="status" className="text-sm">{message}</p>}
        <Button type="submit" disabled={pending}>{pending ? 'Gemmer…' : 'Gem notifikationer'}</Button>
      </form>
    </CardContent>
  </Card>;
}
