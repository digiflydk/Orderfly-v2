'use client';

import { useState, type ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { ArrowLeft, ChevronRight, ClipboardList, Languages, Volume2, X } from 'lucide-react';
import { useKdsLanguage } from './kds-language';

type Page = 'menu' | 'sound' | 'orders' | 'language';
export function KdsMenu({ open, onOpenChange, sound, orders, logout }: {
  open: boolean; onOpenChange: (open: boolean) => void;
  sound: ReactNode; orders: ReactNode; logout: ReactNode;
}) {
  const { t, language, setLanguage } = useKdsLanguage();
  const [page, setPage] = useState<Page>('menu');
  const options = [
    { id: 'sound', label: t('Lydindstillinger'), description: t('Lyd, lydstyrke og test'), icon: Volume2 },
    { id: 'orders', label: t('Ordreindstillinger'), description: t('Opdatering, forudbestillinger og alarmer'), icon: ClipboardList },
    { id: 'language', label: t('Sprog'), description: language === 'da' ? 'Dansk' : 'English', icon: Languages },
  ] as const;
  const title = page === 'menu' ? t('Indstillinger') : options.find(option => option.id === page)!.label;
  return <Dialog.Root open={open} onOpenChange={value => { if (!value) setPage('menu'); onOpenChange(value); }}>
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-[140] bg-slate-950/40 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0 motion-reduce:animate-none" />
      <Dialog.Content id="kds-settings" lang={language} aria-describedby={undefined} onCloseAutoFocus={event => { event.preventDefault(); document.getElementById('kds-menu-trigger')?.focus(); }} className="fixed inset-y-0 left-0 z-[150] flex w-full max-w-lg flex-col border-r bg-white text-slate-900 shadow-2xl duration-300 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:slide-in-from-left data-[state=closed]:slide-out-to-left motion-reduce:animate-none">
        <header className="flex shrink-0 items-center gap-3 border-b p-5">
          {page !== 'menu' && <button type="button" aria-label={t('Tilbage til menu')} onClick={() => setPage('menu')} className="flex min-h-12 min-w-12 items-center justify-center rounded-xl border hover:bg-slate-100"><ArrowLeft aria-hidden="true" className="h-5 w-5" /></button>}
          <Dialog.Title className="text-xl font-bold">{title}</Dialog.Title>
          <Dialog.Close aria-label={t('Luk menu')} className="ml-auto flex min-h-12 min-w-12 items-center justify-center rounded-xl border hover:bg-slate-100"><X aria-hidden="true" className="h-5 w-5" /></Dialog.Close>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5">
          {page === 'menu' ? <nav aria-label={t('Indstillinger')} className="space-y-3">{options.map(({ id, label, description, icon: Icon }) => <button type="button" key={id} aria-label={label} onClick={() => setPage(id)} className="flex min-h-24 w-full items-center gap-4 rounded-2xl border p-4 text-left transition-colors hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-slate-900"><span className="rounded-xl bg-slate-100 p-3"><Icon aria-hidden="true" className="h-6 w-6" /></span><span className="min-w-0 flex-1"><span className="block text-lg font-semibold">{label}</span><span className="mt-1 block text-sm text-slate-500">{description}</span></span><ChevronRight aria-hidden="true" className="h-5 w-5 shrink-0" /></button>)}</nav>
            : page === 'sound' ? <section aria-label={title}>{sound}</section>
            : page === 'orders' ? <section aria-label={title}>{orders}</section>
            : <section aria-label={title}><label className="block text-sm font-semibold">{t('Sprog')}<select aria-label={t('Sprog')} className="mt-3 min-h-14 w-full rounded-xl border bg-white px-4 text-lg" value={language} onChange={event => setLanguage(event.target.value === 'en' ? 'en' : 'da')}><option value="da">Dansk</option><option value="en">English</option></select></label><p className="mt-4 text-sm text-slate-500">{t('Sproget gemmes på denne enhed.')}</p></section>}
        </div>
        {page === 'menu' && logout && <footer className="shrink-0 border-t bg-slate-50 p-5 [&_button]:min-h-14 [&_button]:w-full">{logout}</footer>}
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
