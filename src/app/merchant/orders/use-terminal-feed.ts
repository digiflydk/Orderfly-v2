'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { TerminalQuery, TerminalReadResult } from '@/lib/orders/terminal-types';

const POLL_MS = 15_000;
const TIMEOUT_MS = 12_000;
// Shared by this page's feed instances; unlike message text this records the
// ordering of authorization evidence across foreground and background reads.
let authorizationRevision = 0;
let latestAuthorizationDenial = 0;
export function useTerminalFeed(query: TerminalQuery, enabled = true, endpoint = '/api/merchant/orders') {
  const key = new URLSearchParams(Object.entries(query).filter(([, value]) => value !== undefined && value !== '') as [string, string][]).toString();
  const [data, setData] = useState<TerminalReadResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deniedRevision, setDeniedRevision] = useState(0);
  const [authorizedRevision, setAuthorizedRevision] = useState(0);
  const [denialMessage, setDenialMessage] = useState('');
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [offline, setOffline] = useState(false);
  const [newOrders, setNewOrders] = useState(0);
  const [sound, setSound] = useState(false);
  const [soundError, setSoundError] = useState('');
  const [tick, setTick] = useState(0);
  const audio = useRef<AudioContext | null>(null), soundEnabled = useRef(false);
  const seen = useRef<Set<string> | null>(null), active = useRef<AbortController | null>(null);
  const generation = useRef(0), nextCursor = useRef<string | null>(null);
  const run = useRef<(append?: boolean) => Promise<void>>(async () => {});
  const refresh = useCallback(() => { void run.current(); }, []);
  const loadMore = useCallback(() => { void run.current(true); }, []);
  const clearNewOrders = useCallback(() => setNewOrders(0), []);
  const beep = useCallback(() => {
    const context = audio.current;
    if (!soundEnabled.current || !context) return;
    if (context.state !== 'running') { setSoundError('Lyden er sat på pause. Tryk på lydknappen for at aktivere den igen.'); return; }
    try {
      const oscillator = context.createOscillator(), gain = context.createGain();
      oscillator.connect(gain); gain.connect(context.destination);
      oscillator.frequency.value = 880; gain.gain.setValueAtTime(0.12, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.5);
      oscillator.start(); oscillator.stop(context.currentTime + 0.5);
    } catch { setSoundError('Lyden kunne ikke afspilles. Nye ordrer vises stadig på skærmen.'); }
  }, []);
  const toggleSound = useCallback(async () => {
    if (soundEnabled.current && !soundError) { soundEnabled.current = false; setSound(false); return; }
    try {
      const Audio = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Audio) throw new Error('unsupported');
      audio.current ??= new Audio();
      await audio.current.resume();
      if (audio.current.state !== 'running') throw new Error('suspended');
      soundEnabled.current = true; setSound(true); setSoundError(''); beep();
    } catch { soundEnabled.current = false; setSound(false); setSoundError('Lyd er ikke tilgængelig. Brug det synlige ordreoverblik.'); }
  }, [beep, soundError]);
  useEffect(() => {
    const timer = setInterval(() => setTick(t => t + 1), 5_000);
    return () => { clearInterval(timer); void audio.current?.close(); };
  }, []);
  useEffect(() => {
    const current = ++generation.current;
    active.current?.abort(); active.current = null;
    seen.current = null; nextCursor.current = null;
    setAuthorizedRevision(0);
    setData(null); setLastUpdated(null); setNewOrders(0); setError('');
    if (!enabled) { setLoading(false); run.current = async () => {}; return; }
    let pendingRefresh = false;
    let disposed = false, timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      if (timer) clearTimeout(timer);
      if (query.view === 'board' || !query.view) timer = setTimeout(() => void read(), POLL_MS);
    };
    async function read(append = false) {
      if (disposed || (append && !nextCursor.current)) return;
      if (active.current) { if (!append) pendingRefresh = true; return; }
      if (!navigator.onLine) { setOffline(true); setLoading(false); schedule(); return; }
      const controller = new AbortController(); active.current = controller;
      const startedAfterDenial = latestAuthorizationDenial;
      let timeout: ReturnType<typeof setTimeout> | undefined;
      setLoading(true);
      try {
        const board = query.view === 'board' || !query.view;
        const collected = new Map<string, TerminalReadResult['orders'][number]>();
        let cursor = append ? nextCursor.current : null;
        let result: TerminalReadResult;
        const visited = new Set<string>();
        do {
          const params = new URLSearchParams(key);
          if (cursor) {
            if (visited.has(cursor)) throw new Error('Ordrelisten kunne ikke gennemgås færdig. Prøv igen.');
            visited.add(cursor); params.set('cursor', cursor);
          }
          timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
          const response = await fetch(`${endpoint}?${params}`, { cache: 'no-store', credentials: 'same-origin', signal: controller.signal });
          if (disposed || generation.current !== current) return;
          if (response.status === 401 || response.status === 403) {
            latestAuthorizationDenial = ++authorizationRevision;
            setDeniedRevision(latestAuthorizationDenial); setAuthorizedRevision(0);
            setDenialMessage(response.status === 401 ? 'Din session er udløbet. Log ind igen.' : 'Du har ikke adgang til disse ordrer.');
            setData(null); nextCursor.current = null; setLastUpdated(null);
          }
          if (!response.ok) throw new Error(response.status === 401 ? 'Din session er udløbet. Log ind igen.' : response.status === 403 ? 'Du har ikke adgang til disse ordrer.' : 'Ordrerne kunne ikke opdateres. Prøv igen.');
          result = await response.json() as TerminalReadResult;
          clearTimeout(timeout);
          if (!Array.isArray(result.orders) || !Array.isArray(result.locations) || typeof result.serverTime !== 'string') throw new Error('Ugyldigt svar. Opdater ordreoverblikket.');
          if (disposed || generation.current !== current) return;
          result.orders.forEach(order => collected.set(order.id, order));
          cursor = result.nextCursor;
          if (board && cursor) {
            // Show scan progress without dropping the previous complete snapshot.
            setData(previous => ({ ...result, orders: [...new Map([...(previous?.orders ?? []), ...collected.values()].map(order => [order.id, order])).values()], hasMore: true }));
          }
        } while (board && cursor && !disposed);
        if (disposed || generation.current !== current) return;
        // A response started before another feed rejected access is not fresh
        // authorization evidence merely because it happened to finish later.
        if (startedAfterDenial !== latestAuthorizationDenial) { pendingRefresh = true; return; }
        if (board) {
          const received = [...collected.values()].filter(order => order.status === 'Received');
          if (seen.current) {
            const fresh = received.filter(order => !seen.current!.has(order.id));
            if (fresh.length) { setNewOrders(n => n + fresh.length); beep(); }
          } else seen.current = new Set();
          collected.forEach(order => seen.current!.add(order.id));
          if (seen.current.size > 5_000) seen.current = new Set([...seen.current].slice(-2_500).concat([...collected.keys()]));
        }
        nextCursor.current = result.nextCursor;
        setData(previous => append && !board && previous ? { ...result, orders: [...new Map([...previous.orders, ...result.orders].map(order => [order.id, order])).values()] } : { ...result, orders: [...collected.values()] });
        setAuthorizedRevision(++authorizationRevision);
        setLastUpdated(Date.now()); setOffline(false); setError('');
      } catch (failure) {
        if (disposed || generation.current !== current) return;
        setOffline(!navigator.onLine);
        setError(failure instanceof Error && failure.name !== 'AbortError' ? failure.message : 'Forbindelsen tog for lang tid. Prøv igen.');
      } finally {
        clearTimeout(timeout);
        if (active.current === controller) active.current = null;
        if (!disposed && generation.current === current) {
          setLoading(false);
          if (pendingRefresh) { pendingRefresh = false; void read(); } else schedule();
        }
      }
    }
    run.current = read;
    const wake = () => { if (document.visibilityState === 'visible') void read(); };
    const online = () => { setOffline(false); void read(); };
    const offlineEvent = () => setOffline(true);
    document.addEventListener('visibilitychange', wake); window.addEventListener('focus', wake);
    window.addEventListener('online', online); window.addEventListener('offline', offlineEvent);
    void read();
    return () => {
      disposed = true; if (timer) clearTimeout(timer); active.current?.abort(); active.current = null;
      document.removeEventListener('visibilitychange', wake); window.removeEventListener('focus', wake);
      window.removeEventListener('online', online); window.removeEventListener('offline', offlineEvent);
    };
  // Query is serialized so caller object identity does not restart the feed.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, beep, enabled, endpoint]);
  const stale = lastUpdated !== null && (Date.now() - lastUpdated > 45_000 || offline || !!error);
  void tick;
  return { data, loading, error, deniedRevision, authorizedRevision, denialMessage, lastUpdated, offline, stale, newOrders, sound, soundError, refresh, loadMore, clearNewOrders, toggleSound };
}
