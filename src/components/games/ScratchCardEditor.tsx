'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { saveScratchCardDraft } from '@/app/superadmin/games/actions';
import type { ScratchCardDraft } from '@/lib/games/scratch-card';
import { ScratchCard } from './ScratchCard';

export function ScratchCardEditor({brands,brandId,draft}:{brands:Array<{id:string;name:string}>;brandId:string;draft:ScratchCardDraft|null}) {
  const router = useRouter();
  const [pending,startTransition] = useTransition();
  const [message,setMessage] = useState('');
  const [placement,setPlacement] = useState<'all'|'selected'>(draft?.placement || 'selected');
  const [title,setTitle] = useState(draft?.title || 'Skrab og se, hvad der gemmer sig');
  const [instruction,setInstruction] = useState(draft?.instruction || 'Skrab feltet for at afsløre resultatet.');
  const [revealText,setRevealText] = useState(draft?.revealText || 'Dette er en test af skrabespillet');
  const [paths,setPaths] = useState(draft?.paths.join('\n') || '/');
  function submit(event:React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    startTransition(async()=>{
      const result = await saveScratchCardDraft(form);
      setMessage(result.message);
      if (result.ok) router.refresh();
    });
  }
  return <div className="grid gap-8 lg:grid-cols-2">
    <form onSubmit={submit} className="space-y-5 rounded-xl border bg-white p-6 shadow-sm">
      <div className="rounded-md bg-amber-50 p-3 text-sm text-amber-900">Status: Kun udkast. Sideplaceringerne gemmes til senere aktivering.</div>
      <label className="block text-sm font-medium">Brand
        <select className="mt-1 w-full rounded-md border p-2" value={brandId} onChange={e=>router.push(`/superadmin/games/scratch-card?brand=${encodeURIComponent(e.target.value)}`)}>{brands.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select>
      </label>
      <input type="hidden" name="brandId" value={brandId}/>
      <label className="block text-sm font-medium">Overskrift<input name="title" value={title} onChange={e=>setTitle(e.target.value)} required maxLength={100} className="mt-1 w-full rounded-md border p-2"/></label>
      <label className="block text-sm font-medium">Instruktion<input name="instruction" value={instruction} onChange={e=>setInstruction(e.target.value)} required maxLength={240} className="mt-1 w-full rounded-md border p-2"/></label>
      <label className="block text-sm font-medium">Testtekst bag skrabefeltet<input name="revealText" value={revealText} onChange={e=>setRevealText(e.target.value)} required maxLength={160} className="mt-1 w-full rounded-md border p-2"/></label>
      <label className="block text-sm font-medium">Fremtidig placering
        <select name="placement" value={placement} onChange={e=>setPlacement(e.target.value as 'all'|'selected')} className="mt-1 w-full rounded-md border p-2"><option value="selected">Kun valgte sider</option><option value="all">Hele brandsitet</option></select>
      </label>
      {placement === 'selected' && <label className="block text-sm font-medium">Sideadresser, én sti pr. linje<textarea name="paths" value={paths} onChange={e=>setPaths(e.target.value)} rows={4} placeholder={'/\n/menu'} className="mt-1 w-full rounded-md border p-2"/><span className="mt-1 block text-xs text-muted-foreground">Eksempel: / eller /menu. Brug stier uden domænenavn.</span></label>}
      {placement === 'all' && <input type="hidden" name="paths" value=""/>}
      <button disabled={pending} className="rounded-md bg-black px-5 py-2 text-white disabled:opacity-50">{pending ? 'Gemmer…' : 'Gem udkast'}</button>
      {message && <p role="status" className="text-sm">{message}</p>}
    </form>
    <div><h2 className="mb-4 text-lg font-semibold">Administrator-preview</h2><ScratchCard brandName={brands.find(b=>b.id===brandId)?.name || brandId} title={title} instruction={instruction} revealText={revealText}/></div>
  </div>;
}
