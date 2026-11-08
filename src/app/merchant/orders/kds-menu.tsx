'use client';

import { useState, type ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { ArrowLeft, ChevronRight, ClipboardList, Languages, Store, Volume2, X, Settings } from 'lucide-react';
import type { KitchenHours } from '@/lib/orders/kds-settings';
import { useKdsLanguage } from './kds-language';

type Page = 'menu' | 'sound' | 'orders' | 'language' | 'store' | 'settings';
export function KdsMenu({ open, onOpenChange, sound, orders, logout, mobileNavigation, openingHours, notificationSettings }: {
  open: boolean; onOpenChange: (open: boolean) => void;
  sound: ReactNode; orders: ReactNode; logout: ReactNode; mobileNavigation?: ReactNode; openingHours?: KitchenHours; notificationSettings?: ReactNode;
}) {
  const { t, language, setLanguage } = useKdsLanguage();
  const [page, setPage] = useState<Page>('menu');
  const days = [
    { key: 'monday', da: 'Mandag', en: 'Monday' }, { key: 'tuesday', da: 'Tirsdag', en: 'Tuesday' },
    { key: 'wednesday', da: 'Onsdag', en: 'Wednesday' }, { key: 'thursday', da: 'Torsdag', en: 'Thursday' },
    { key: 'friday', da: 'Fredag', en: 'Friday' }, { key: 'saturday', da: 'Lørdag', en: 'Saturday' },
    { key: 'sunday', da: 'Søndag', en: 'Sunday' },
  ] as const;
  const options = [
    { id: 'sound', label: t('Lydindstillinger'), description: t('Lyd, lydstyrke og test'), icon: Volume2 },
    { id: 'orders', label: t('Ordreindstillinger'), description: t('Opdatering, forudbestillinger og alarmer'), icon: ClipboardList },
    { id: 'language', label: t('Sprog'), description: language === 'da' ? 'Dansk' : 'English', icon: Languages },
    { id: 'store', label: t('Butik'), description: t('Åbningstider'), icon: Store },
  ] as const;
  const title = page === 'menu' || page === 'settings' ? t('Indstillinger') : options.find(option => option.id === page)!.label;
  return <Dialog.Root open={open} onOpenChange={value => { if (!value) setPage('menu'); onOpenChange(value); }}>
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-[140] bg-slate-950/40 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0 motion-reduce:animate-none" />
      <Dialog.Content id="kds-settings" lang={language} aria-describedby={undefined} onCloseAutoFocus={event => { event.preventDefault(); (document.getElementById(window.matchMedia('(max-width: 1023px)').matches ? 'kds-menu-trigger-mobile' : 'kds-menu-trigger'))?.focus(); }} className="fixed inset-y-0 left-0 z-[150] flex w-full max-w-lg rounded-r-3xl lg:rounded-none flex-col border-r bg-white text-slate-900 shadow-2xl duration-300 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:slide-in-from-left data-[state=closed]:slide-out-to-left motion-reduce:animate-none">
        <header className="flex shrink-0 items-center gap-3 p-5 pt-[max(1.25rem,env(safe-area-inset-top))]">
          {page !== 'menu' && <button type="button" aria-label={t('Tilbage til menu')} onClick={() => setPage(page !== 'settings' && page !== 'store' && window.matchMedia('(max-width: 1023px)').matches ? 'settings' : 'menu')} className="flex min-h-12 min-w-12 items-center justify-center rounded-full bg-slate-100 hover:bg-slate-200"><ArrowLeft aria-hidden="true" className="h-5 w-5" /></button>}
          <Dialog.Title className="text-2xl font-bold">{title}</Dialog.Title>
          <Dialog.Close aria-label={t('Luk menu')} className="ml-auto flex min-h-12 min-w-12 items-center justify-center rounded-full bg-slate-100 hover:bg-slate-200"><X aria-hidden="true" className="h-5 w-5" /></Dialog.Close>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5">
          {page === 'menu' || page === 'settings' ? <>
            {page === 'menu' && mobileNavigation && <div className="lg:hidden">{mobileNavigation}<div className="my-4 border-t" /><button type="button" aria-label={t('Indstillinger')} onClick={() => setPage('settings')} className="flex min-h-16 w-full items-center gap-4 rounded-xl px-4 text-left text-lg font-semibold"><Settings aria-hidden="true" className="h-6 w-6" />{t('Indstillinger')}</button><button type="button" aria-label={t('Butik')} onClick={() => setPage('store')} className="flex min-h-16 w-full items-center gap-4 rounded-xl px-4 text-left text-lg font-semibold"><Store aria-hidden="true" className="h-6 w-6" />{t('Butik')}</button></div>}
            <div className={page === 'menu' && mobileNavigation ? 'hidden lg:block' : ''}>
              <h2 className="mb-3 mt-4 text-xl font-bold">{t('Indstillinger')}</h2>
              <nav aria-label={t('Indstillinger')} className="divide-y">{options.map(({id,label,description,icon:Icon}) => <button key={id} type="button" aria-label={label} onClick={() => setPage(id)} className={`flex min-h-16 w-full items-center gap-3 py-4 text-left hover:bg-slate-50 ${id === 'store' ? 'lg:hidden' : ''}`}><Icon aria-hidden="true" className="h-5 w-5 shrink-0" /><span className="min-w-0 flex-1"><span className="block text-base font-semibold">{label}</span><span className="mt-1 block text-sm text-slate-500">{description}</span></span><ChevronRight aria-hidden="true" className="h-5 w-5 shrink-0 text-slate-500" /></button>)}</nav>
              {notificationSettings && <section className="mt-6 border-t pt-5">{notificationSettings}</section>}
              {logout && <section className="mt-8 border-t pt-5"><h2 className="mb-3 text-xl font-bold">{t('Konto')}</h2><div className="[&_button]:min-h-14 [&_button]:w-full [&_button]:border-0 [&_button]:bg-transparent [&_button]:px-0 [&_button]:text-left [&_button]:text-red-600">{logout}</div></section>}
            </div>
          </>
            : page === 'sound' ? <section aria-label={title}>{sound}</section>
            : page === 'orders' ? <section aria-label={title}>{orders}</section>
            : page === 'store' ? <section aria-label={title} className="space-y-4">
                <h2 className="text-lg font-semibold">{t('Åbningstider')}</h2>
                {openingHours && Object.keys(openingHours).length ? <div className="divide-y rounded-xl border px-4">
                  {days.map(day => { const hours = openingHours[day.key]; return <div key={day.key} className="flex items-center justify-between gap-3 py-4 text-sm">
                    <span className="font-semibold">{language === 'en' ? day.en : day.da}</span>
                    <span>{!hours ? t('Ikke angivet') : hours.isOpen ? `${hours.open} – ${hours.close}` : t('Lukket')}</span>
                  </div>; })}
                </div> : <p className="text-sm text-slate-500">{t('Åbningstider er ikke tilgængelige.')}</p>}
                <p className="text-sm text-slate-500">{t('Åbningstider ændres i restaurantens administration.')}</p>
              </section>
            : <section aria-label={title}><label className="block text-sm font-semibold">{t('Sprog')}<select aria-label={t('Sprog')} className="mt-3 min-h-14 w-full rounded-xl border bg-white px-4 text-lg" value={language} onChange={event => setLanguage(event.target.value === 'en' ? 'en' : 'da')}><option value="da">Dansk</option><option value="en">English</option></select></label><p className="mt-4 text-sm text-slate-500">{t('Sproget gemmes på denne enhed.')}</p></section>}
        </div>

      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
