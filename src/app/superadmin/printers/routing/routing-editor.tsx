'use client';
import { useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { AdminSelectField } from '@/components/superadmin/admin-select-field';
import type { PrinterRoutingRule } from '@/lib/printing/routing-preview';
type Brand = { id: string; name: string };
type Location = Brand & { brandId: string };
type Choice = { id: string; name: string; categoryId?: string };
type Printer = { configuration: { id: string; name: string; brandId: string; locationId: string; state: 'active' | 'paused' | 'disabled'; manufacturer: 'star'; model: 'mc-print2' | 'mc-print3'; transport: 'cloudprnt-http' | 'cloudprnt-mqtt'; paperWidthMm: 58 | 80 }; revision: number };
const id = z.string().max(128).regex(/^[A-Za-z0-9_-]{1,128}$/);
const name = z.string().min(1).max(160).refine(value => !!value.trim() && !/[\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}]/u.test(value));
const scopeSchema = z.object({ brandId: id, locationId: id }).strict();
const ruleSchema = z.object({ id, brandId: id, locationId: id, printerId: id, effect: z.enum(['include', 'exclude']),
  match: z.discriminatedUnion('type', [z.object({ type: z.literal('all') }).strict(), z.object({ type: z.literal('product'), id }).strict(), z.object({ type: z.literal('category'), id }).strict()]),
  deliveryTypes: z.array(z.enum(['Pickup', 'Delivery'])).min(1).max(2).optional() }).strict();
const printerSchema = z.object({ revision: z.number().int().positive().safe(), configuration: z.object({ id, brandId: id, locationId: id,
  name: name.refine(value => value.length <= 80), state: z.enum(['active', 'paused', 'disabled']), manufacturer: z.literal('star'), model: z.enum(['mc-print2', 'mc-print3']),
  transport: z.enum(['cloudprnt-http', 'cloudprnt-mqtt']), paperWidthMm: z.union([z.literal(58), z.literal(80)]) }).strict().refine(c => c.model !== 'mc-print2' || c.transport === 'cloudprnt-http' && c.paperWidthMm === 58) }).strict();
const savedSchema = z.object({ scope: scopeSchema, revision: z.number().int().positive().safe().nullable(), rules: z.array(ruleSchema).max(256), printers: z.array(printerSchema).max(16), referencesVerified: z.boolean(), dispatchAuthorized: z.literal(false) }).strict();
const pageSchema = z.object({ items: z.array(printerSchema).max(20), nextCursor: id.nullable() }).strict();
const choicesSchema = z.object({ scope: scopeSchema, kind: z.enum(['product', 'category']), items: z.array(z.object({ id, name, categoryId: id.optional() }).strict()).max(50), nextCursor: id.nullable() }).strict();
const targetSchema = z.object({ printerId: id, state: z.enum(['active', 'paused']), dispatchAuthorized: z.literal(false), lines: z.array(z.object({ lineId: id, brandId: id, locationId: id, itemType: z.literal('product'), productId: id, categoryId: id, name, quantity: z.number().int().min(1).max(99) }).strict()).max(20) }).strict();
const previewSchema = z.object({ scope: scopeSchema, sampleOnly: z.literal(true), mode: z.literal('preview'), dispatchAuthorized: z.literal(false), targets: z.array(targetSchema).max(16),
  decisions: z.array(z.object({ lineId: id, printerId: id, outcome: z.enum(['included', 'excluded', 'no_matching_rule', 'printer_disabled', 'combo_requires_projection']), selectedRuleIds: z.array(id).max(256), shadowedRuleIds: z.array(id).max(256) }).strict()).max(320),
  unrouted: z.array(z.object({ lineId: id, reason: z.enum(['no_included_printer', 'combo_requires_projection']) }).strict()).max(20),
  lines: z.array(z.object({ lineId: id, name, quantity: z.number().int().min(1).max(99) }).strict()).max(20),
  printers: z.array(z.object({ id, name }).strict()).max(16) }).strict();
type Preview = z.infer<typeof previewSchema>;
const api = '/api/superadmin/printers/routing';
function same(a: { brandId: string; locationId: string }, b: { brandId: string; locationId: string }) { return a.brandId === b.brandId && a.locationId === b.locationId; }
function validatedSaved(input: unknown, scope: { brandId: string; locationId: string }) {
  const result = savedSchema.parse(input);
  const ids = result.printers.map(p => p.configuration.id), referenced = new Set(result.rules.map(r => r.printerId));
  if (!same(result.scope, scope) || new Set(ids).size !== ids.length || new Set(result.rules.map(r => r.id)).size !== result.rules.length
    || referenced.size > 16 || result.revision === null && result.rules.length > 0
    || result.printers.some(p => !same(p.configuration, scope))
    || result.rules.some(r => !same(r, scope) || r.deliveryTypes && new Set(r.deliveryTypes).size !== r.deliveryTypes.length)
    || (result.referencesVerified ? ids.length !== referenced.size || ids.some(id => !referenced.has(id)) || result.rules.some(r => !ids.includes(r.printerId))
      : result.printers.length !== 0 || result.revision === null || result.rules.length === 0)) throw Error('invalid_response');
  return result;
}
async function json(response: Response) { const text = await response.text(); if (text.length > 131072) throw Error('invalid_response'); return JSON.parse(text); }
function message(status: number, mutation = false) {
  return status === 401 ? 'Din session er udløbet. Log ind igen.' : status === 403 ? 'Du har ikke adgang til routing på denne lokation.'
    : status === 409 ? 'Opsætningen eller kataloget er ændret. Genindlæs før du gemmer igen.'
    : status === 503 && mutation ? 'Lagring er ikke tilgængelig. Genindlæs før du prøver igen.'
    : status === 400 ? 'Kontrollér reglerne og prøv igen.' : 'Routing kunne ikke indlæses. Prøv igen.';
}
export function PrinterRoutingEditor({ brands, locations, editLocations }: { brands: Brand[]; locations: Location[]; editLocations: Array<{ id: string; brandId: string }> }) {
  const [brandId, setBrand] = useState(brands.length === 1 ? brands[0].id : ''), [locationId, setLocation] = useState('');
  const [baseline, setBaseline] = useState('[]');
  const [loaded, setLoaded] = useState(false), [revision, setRevision] = useState<number | null>(null), [rules, setRules] = useState<PrinterRoutingRule[]>([]);
  const [referencesVerified, setReferencesVerified] = useState(false);
  const [printers, setPrinters] = useState<Printer[]>([]), [products, setProducts] = useState<Choice[]>([]), [categories, setCategories] = useState<Choice[]>([]);
  const [cursors, setCursors] = useState<{ printer: string | null; product: string | null; category: string | null }>({ printer: null, product: null, category: null });
  const [pending, setPending] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState(''), [blocked, setBlocked] = useState(false), [sessionLost, setSessionLost] = useState(false);
  const [sample, setSample] = useState(''), [deliveryType, setDelivery] = useState<'Pickup' | 'Delivery'>('Pickup'), [preview, setPreview] = useState<Preview | null>(null), [refresh, setRefresh] = useState(0);
  const [editingId, setEditing] = useState('');
  const [newPrinter, setNewPrinter] = useState(''), [kind, setKind] = useState<'all' | 'product' | 'category'>('all'), [matchId, setMatch] = useState(''), [effect, setEffect] = useState<'include' | 'exclude'>('include'), [fulfillment, setFulfillment] = useState('both');
  const generation = useRef(0), action = useRef(false), mounted = useRef(true), loadController = useRef<AbortController | null>(null);
  const scope = { brandId, locationId }, key = JSON.stringify(scope), current = useRef(key); current.current = key;
  const canEdit = !sessionLost && editLocations.some(row => same({ brandId: row.brandId, locationId: row.id }, scope));
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; generation.current++; loadController.current?.abort(); }; }, []);
  const dropSession = () => { generation.current++; loadController.current?.abort(); setSessionLost(true); setLoaded(false); setReferencesVerified(false); setRules([]); setPrinters([]); setProducts([]); setCategories([]); setPreview(null); setBlocked(true); setError(message(401)); };
  useEffect(() => {
    if (sessionLost) return;
    setBusy(false); setEditing(''); setBaseline('[]'); setLoaded(false); setReferencesVerified(false); setRules([]); setPrinters([]); setProducts([]); setCategories([]); setPreview(null); setError(''); setNotice(''); setBlocked(false); setSample(''); setMatch(''); setNewPrinter('');
    if (!brandId || !locations.some(row => row.id === locationId && row.brandId === brandId) || sessionLost) return;
    const version = ++generation.current, controller = new AbortController(); loadController.current = controller;
    const valid = () => mounted.current && !controller.signal.aborted && generation.current === version && current.current === key;
    const fetchData = async (url: string) => { const response = await fetch(url, { credentials: 'same-origin', cache: 'no-store', signal: controller.signal });
      if (response.status === 401 && valid()) dropSession(); if (!response.ok) throw Error(message(response.status)); return json(response); };
    const query = new URLSearchParams(scope);
    Promise.all([fetchData(api + '?' + query), fetchData('/api/merchant/printers?' + query + '&limit=20'),
      fetchData(api + '/catalog?' + query + '&kind=product'), fetchData(api + '/catalog?' + query + '&kind=category')])
      .then(([savedRaw, printersRaw, productsRaw, categoriesRaw]) => {
        if (!valid()) return;
        const saved = validatedSaved(savedRaw, scope), page = pageSchema.parse(printersRaw), productPage = choicesSchema.parse(productsRaw), categoryPage = choicesSchema.parse(categoriesRaw);
        if (page.items.some(p => !same(p.configuration, scope)) || !same(productPage.scope, scope) || !same(categoryPage.scope, scope) || productPage.kind !== 'product' || categoryPage.kind !== 'category'
          || productPage.items.some(p => !p.categoryId) || [page.items.map(p => p.configuration.id), productPage.items.map(p => p.id), categoryPage.items.map(p => p.id)].some(ids => new Set(ids).size !== ids.length) || page.nextCursor && (page.items.length !== 20 || page.items[19].configuration.id !== page.nextCursor)) throw Error('invalid_response');
        setRevision(saved.revision); setReferencesVerified(saved.referencesVerified); setRules(saved.rules); setBaseline(JSON.stringify(saved.rules)); setPrinters([...new Map([...saved.printers, ...page.items].map(p => [p.configuration.id, p])).values()]);
        setProducts(productPage.items); setCategories(categoryPage.items); setCursors({ printer: page.nextCursor, product: productPage.nextCursor, category: categoryPage.nextCursor }); setLoaded(true);
      }).catch(failure => { if (valid()) setError(failure instanceof Error && /^(Din session|Du har ikke adgang|Opsætningen|Routing kunne)/.test(failure.message) ? failure.message : 'Routing kunne ikke indlæses. Prøv igen.'); });
    return () => { controller.abort(); };
  }, [key, refresh, sessionLost]);
  function changeScope(brand: string, location: string) { if (action.current) return; generation.current++; loadController.current?.abort(); setLoaded(false); setBrand(brand); setLocation(location); }
  async function more(type: 'printer' | 'product' | 'category') {
    const cursor = cursors[type]; if (!cursor || action.current || busy || !loaded) return;
    setBusy(true); setError(''); const version = generation.current, oldKey = key;
    try {
      const query = new URLSearchParams({ ...scope, after: cursor });
      const url = type === 'printer' ? '/api/merchant/printers?' + query + '&limit=20' : api + '/catalog?' + query + '&kind=' + type;
      const response = await fetch(url, { cache: 'no-store', credentials: 'same-origin' });
      if (generation.current !== version || current.current !== oldKey || !mounted.current) return;
      if (response.status === 401) { dropSession(); return; } if (!response.ok) throw Error(message(response.status));
      const raw = await json(response);
      if (generation.current !== version || current.current !== oldKey || !mounted.current) return;
      if (type === 'printer') { const page = pageSchema.parse(raw); if (page.items.some(p => !same(p.configuration, scope)) || new Set(page.items.map(p => p.configuration.id)).size !== page.items.length || page.nextCursor === cursor || page.nextCursor && (page.items.length !== 20 || page.items[19].configuration.id !== page.nextCursor)) throw Error('invalid_response');
        setPrinters(old => [...new Map([...old, ...page.items].map(p => [p.configuration.id, p])).values()]); setCursors(old => ({ ...old, printer: page.nextCursor })); }
      else { const page = choicesSchema.parse(raw); if (!same(page.scope, scope) || page.kind !== type || page.nextCursor === cursor || new Set(page.items.map(p => p.id)).size !== page.items.length || type === 'product' && page.items.some(p => !p.categoryId)) throw Error('invalid_response');
        const update = type === 'product' ? setProducts : setCategories; update(old => [...new Map([...old, ...page.items].map(p => [p.id, p])).values()]); setCursors(old => ({ ...old, [type]: page.nextCursor })); }
    } catch (failure) { if (generation.current === version && current.current === oldKey && mounted.current) setError(failure instanceof Error && /^(Du har|Routing|Opsætningen)/.test(failure.message) ? failure.message : 'Routing kunne ikke indlæses. Prøv igen.'); }
    finally { if (generation.current === version && mounted.current) setBusy(false); }
  }
  function addRule() {
    if (!canEdit || blocked || action.current || !loaded || !editingId && rules.length >= 256 || !printers.some(p => p.configuration.id === newPrinter) || kind !== 'all' && !(kind === 'product' ? products : categories).some(c => c.id === matchId)) return;
    const existing = new Set(rules.map(r => r.id)); let index = 1; while (existing.has('rule-' + index)) index++;
    const next: PrinterRoutingRule = { id: editingId || 'rule-' + index, ...scope, printerId: newPrinter, effect, match: kind === 'all' ? { type: 'all' } : { type: kind, id: matchId },
      ...(fulfillment === 'both' ? {} : { deliveryTypes: [fulfillment as 'Pickup' | 'Delivery'] }) };
    const candidate = editingId ? rules.map(rule => rule.id === editingId ? next : rule) : [...rules, next];
    if (new Set(candidate.map(r => r.printerId)).size > 16) { setError('Vælg højst 16 printere i reglerne.'); return; }
    setRules(candidate); setEditing(''); setPreview(null); setNotice('');
  }
  async function submit(mode: 'save' | 'preview') {
    if (action.current || busy || !loaded || blocked || sessionLost || editingId || mode === 'save' && !canEdit || mode === 'preview' && (!sample || !referencesVerified)) return;
    action.current = true; generation.current++; loadController.current?.abort(); setPending(true); setError(''); setNotice('');
    const submittedKey = key, submittedRules = JSON.stringify(rules), beforeRevision = revision;
    try {
      const response = await fetch(mode === 'save' ? api : api + '/preview', { method: mode === 'save' ? 'PUT' : 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...scope, rules, ...(mode === 'save' ? { expectedRevision: revision ?? 0 } : { deliveryType, items: [{ productId: sample, quantity: 1 }] }) }) });
      if (!mounted.current || current.current !== submittedKey) return;
      if (response.status === 401) { dropSession(); return; }
      if (!response.ok) { setError(message(response.status, mode === 'save')); if (mode === 'save' && response.status !== 400) setBlocked(true); setPreview(null); return; }
      const raw = await json(response);
      if (!mounted.current || current.current !== submittedKey) return;
      if (mode === 'save') { const saved = validatedSaved(raw, scope);
        if (!saved.referencesVerified || saved.revision !== (beforeRevision ?? 0) + 1 || JSON.stringify(saved.rules) !== submittedRules) throw Error('invalid_response');
        setRevision(saved.revision); setReferencesVerified(saved.referencesVerified); setRules(saved.rules); setBaseline(JSON.stringify(saved.rules)); setEditing(''); setNotice('Routingreglerne er gemt.'); }
      else { const result = previewSchema.parse(raw);
        if (!same(result.scope, scope) || result.targets.some(t => t.lines.some(line => !same(line, scope))) || result.printers.some(p => !rules.some(r => r.printerId === p.id))
          || result.targets.some(t => !rules.some(r => r.printerId === t.printerId) || t.lines.some(line => line.productId !== sample || line.lineId !== 'sample-0'))
          || result.lines.some(line => line.lineId !== 'sample-0') || result.unrouted.some(line => line.lineId !== 'sample-0')
          || result.decisions.some(d => d.lineId !== 'sample-0' || !rules.some(r => r.printerId === d.printerId) || [...d.selectedRuleIds, ...d.shadowedRuleIds].some(ruleId => !rules.some(r => r.id === ruleId)))) throw Error('invalid_response');
        setPreview(result); }
    } catch { if (mounted.current && current.current === submittedKey) { setPreview(null); setError(mode === 'save' ? 'Det er uklart, om reglerne blev gemt. Genindlæs før du prøver igen.' : 'Eksempelvisningen kunne ikke beregnes. Prøv igen.'); if (mode === 'save') setBlocked(true); } }
    finally { action.current = false; if (mounted.current) setPending(false); }
  }
  const selectedName = (rule: PrinterRoutingRule) => rule.match.type === 'all' ? 'Alle produkter' : (rule.match.type === 'product' ? products : categories).find(c => c.id === ('id' in rule.match ? rule.match.id : ''))?.name || (!referencesVerified ? rule.match.type === 'product' ? 'Produkt ikke tilgængeligt (gemt valg)' : 'Kategori ikke tilgængelig (gemt valg)' : 'Gemt valg (ikke indlæst på denne side)');
  return <div className="min-w-0 space-y-6 [&_label]:max-w-full [&_select]:max-w-full">
    <header><a href="/superadmin/printers" className="text-sm text-primary underline">Tilbage til printere</a><h1 className="mt-3 text-3xl font-semibold">Routingregler</h1><p className="mt-2 text-sm text-muted-foreground">Fordel produkter til de rigtige printere, og kontrollér en eksempelordre før du gemmer.</p></header>
    <div className="admin-filter-bar flex flex-wrap items-end gap-3 p-4">
      <AdminSelectField label="Brand" value={brandId} disabled={pending} onChange={e => changeScope(e.target.value, '')}><option value="">Vælg brand</option>{brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</AdminSelectField>
      <AdminSelectField label="Lokation" value={locationId} disabled={pending || !brandId} onChange={e => changeScope(brandId, e.target.value)}><option value="">Vælg lokation</option>{locations.filter(l => l.brandId === brandId).map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</AdminSelectField>
      <Button variant="outline" disabled={pending || !locationId} onClick={() => { if (action.current) return; setSessionLost(false); setBusy(false); setRefresh(n => n + 1); }}>Genindlæs</Button>
    </div>
    {error && <p role="alert" className="text-sm">{error}</p>}{notice && <p role="status">{notice}</p>}
    {!locationId ? <p>Vælg brand og lokation.</p> : !loaded && !error ? <p role="status">Indlæser routing…</p> : loaded && <>
      {!referencesVerified && <p role="note" className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">Gemte regler har utilgængelige referencer. Fjern eller erstat dem, og gem igen før eksempelvisning.</p>}
      <section className="space-y-4 rounded-lg border p-4" aria-label="Regler">
        <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-semibold">Regler</h2><span className="text-sm text-muted-foreground">{revision ? `Gemt version ${revision}` : 'Ingen gemte regler'}{JSON.stringify(rules) !== baseline ? ' · Ugemte ændringer' : ''}</span></div>
        {!rules.length ? <p>Ingen routingregler. Tilføj en regel for at fordele produkter.</p> : <div className="max-w-full overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left"><th className="p-2">Printer</th><th className="p-2">Valg</th><th className="p-2">Regel</th><th className="p-2">Ordretype</th><th className="p-2">Handling</th></tr></thead><tbody>{rules.map(r => <tr key={r.id} className="border-b"><td className="p-2">{printers.find(p => p.configuration.id === r.printerId)?.configuration.name || 'Printer ikke tilgængelig'}</td><td className="p-2">{selectedName(r)}</td><td className="p-2">{r.effect === 'include' ? 'Medtag' : 'Udelad'}</td><td className="p-2">{!r.deliveryTypes ? 'Alle' : r.deliveryTypes.map(t => t === 'Pickup' ? 'Afhentning' : 'Levering').join(', ')}</td><td className="p-2"><div className="flex flex-wrap gap-2"><Button variant="outline" disabled={pending || blocked || !canEdit} onClick={() => { setEditing(r.id); setNewPrinter(r.printerId); setKind(r.match.type); setMatch('id' in r.match ? r.match.id : ''); setEffect(r.effect); setFulfillment(r.deliveryTypes?.length === 1 ? r.deliveryTypes[0] : 'both'); }}>Rediger regel</Button><Button variant="outline" disabled={pending || blocked || !canEdit} onClick={() => { setRules(old => old.filter(rule => rule.id !== r.id)); setEditing(''); setPreview(null); setNotice(''); }}>Fjern regel</Button></div></td></tr>)}</tbody></table></div>}
        <fieldset disabled={pending || blocked || !canEdit} className="flex min-w-0 flex-wrap items-end gap-3"><legend className="mb-3 font-medium">{editingId ? 'Rediger regel' : 'Tilføj regel'}</legend>
          <AdminSelectField label="Printer" value={newPrinter} onChange={e => setNewPrinter(e.target.value)}><option value="">Vælg printer</option>{newPrinter && !printers.some(p => p.configuration.id === newPrinter) && <option value={newPrinter} disabled>Printer ikke tilgængelig (gemt valg)</option>}{printers.map(p => <option key={p.configuration.id} value={p.configuration.id}>{p.configuration.name}</option>)}</AdminSelectField>
          <AdminSelectField label="Regeltype" value={kind} onChange={e => { setKind(e.target.value as typeof kind); setMatch(''); }}><option value="all">Alle produkter</option><option value="category">Kategori</option><option value="product">Produkt</option></AdminSelectField>
          {kind !== 'all' && <AdminSelectField label={kind === 'product' ? 'Produkt' : 'Kategori'} value={matchId} onChange={e => setMatch(e.target.value)}><option value="">Vælg {kind === 'product' ? 'produkt' : 'kategori'}</option>{matchId && !(kind === 'product' ? products : categories).some(c => c.id === matchId) && <option value={matchId} disabled>{kind === 'product' ? 'Produkt ikke tilgængeligt (gemt valg)' : 'Kategori ikke tilgængelig (gemt valg)'}</option>}{(kind === 'product' ? products : categories).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</AdminSelectField>}
          <AdminSelectField label="Handling" value={effect} onChange={e => setEffect(e.target.value as typeof effect)}><option value="include">Medtag</option><option value="exclude">Udelad</option></AdminSelectField>
          <AdminSelectField label="Ordretype" value={fulfillment} onChange={e => setFulfillment(e.target.value)}><option value="both">Alle ordretyper</option><option value="Pickup">Afhentning</option><option value="Delivery">Levering</option></AdminSelectField>
          <Button onClick={addRule} disabled={!editingId && rules.length >= 256 || !newPrinter || kind !== 'all' && !matchId}>{editingId ? 'Gem regelændring' : 'Tilføj regel'}</Button>{editingId && <Button variant="outline" onClick={() => setEditing('')}>Annuller regelændring</Button>}
        </fieldset>
        <div className="flex flex-wrap gap-2">{(['printer', 'product', 'category'] as const).filter(type => cursors[type]).map(type => <Button key={type} variant="outline" disabled={pending || busy} onClick={() => more(type)}>Flere {type === 'printer' ? 'printere' : type === 'product' ? 'produkter' : 'kategorier'}</Button>)}</div>
        <Button disabled={pending || busy || blocked || !canEdit || !!editingId} onClick={() => submit('save')}>{pending ? 'Arbejder…' : 'Gem routingregler'}</Button>
      </section>
      <section aria-label="Eksempelordre" className="space-y-4 rounded-lg border p-4"><h2 className="text-xl font-semibold">Eksempelordre</h2><p className="text-sm text-muted-foreground">Viser fordelingen med dine aktuelle regler. Eksemplet udskriver ingen bon.</p>
        <div className="flex flex-wrap items-end gap-3"><AdminSelectField label="Eksempelprodukt" disabled={pending || blocked} value={sample} onChange={e => { setSample(e.target.value); setPreview(null); }}><option value="">Vælg produkt</option>{products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</AdminSelectField>
          <AdminSelectField label="Eksempelordretype" disabled={pending || blocked} value={deliveryType} onChange={e => { setDelivery(e.target.value as typeof deliveryType); setPreview(null); }}><option value="Pickup">Afhentning</option><option value="Delivery">Levering</option></AdminSelectField>
          <Button variant="outline" disabled={pending || busy || blocked || !referencesVerified || !sample || !!editingId} onClick={() => submit('preview')}>Vis fordeling</Button></div>
        {preview && <div aria-label="Fordeling" className="space-y-2 break-words">{preview.targets.map(target => <p key={target.printerId}><strong>{preview.printers.find(p => p.id === target.printerId)?.name}</strong>: {target.lines.map(l => `${l.quantity} × ${l.name}`).join(', ')}{target.state === 'paused' ? ' (på pause)' : ''}</p>)}
          {preview.unrouted.map(line => <p key={line.lineId}>{preview.lines.find(l => l.lineId === line.lineId)?.name}: Ingen printer valgt af reglerne.</p>)}
          {preview.decisions.some(d => d.outcome === 'printer_disabled') && <p>En printer er deaktiveret og modtager ikke eksemplet.</p>}</div>}
      </section>
    </>}
  </div>;
}
