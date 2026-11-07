'use client';
import { isKitchenPreorder, parseKdsSettings } from '@/lib/orders/kds-settings';
import { subscribeTerminalEvents } from './terminal-events-client';
import { TERMINAL_SOUNDS, isTerminalSound, type TerminalSound } from '@/lib/orders/terminal-sounds';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { TerminalQuery, TerminalReadResult } from '@/lib/orders/terminal-types';

const POLL_MS = 15_000;
// Identity upstream can take 12s; allow its response plus scoped database work.
const TIMEOUT_MS = 25_000;
// Shared by this page's feed instances; unlike message text this records the
// ordering of authorization evidence across foreground and background reads.
let authorizationRevision = 0;
let latestAuthorizationDenial = 0;
export function useTerminalFeed(query: TerminalQuery, enabled = true, endpoint = '/api/merchant/orders', notifications = true, push = false, automatic = true) {
  const key = new URLSearchParams(Object.entries(query).filter(([, value]) => value !== undefined && value !== '') as [string, string][]).toString();
  const [data, setData] = useState<TerminalReadResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pushConnected, setPushConnected] = useState(false);
  const [changeRevision, setChangeRevision] = useState(0);
  const lastPushSignal = useRef<number | null>(null);
  const [reconnecting, setReconnecting] = useState(false);
  const lastSuccessful = useRef<number | null>(null);
  const consecutiveFailures = useRef(0);
  const [deniedRevision, setDeniedRevision] = useState(0);
  const [authorizedRevision, setAuthorizedRevision] = useState(0);
  const [denialMessage, setDenialMessage] = useState('');
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [offline, setOffline] = useState(false);
  const [newPreorders, setNewPreorders] = useState<string[]>([]);
  const previousKey = useRef('');
  const [newOrders, setNewOrders] = useState(0);
  const [sound, setSound] = useState(true);
  const [soundId, setSoundIdState] = useState<TerminalSound>('melody');
  const soundIdRef = useRef<TerminalSound>('melody');
  const [volume, setVolumeState] = useState(80);
  const volumeRef = useRef(80);
  const [soundError, setSoundError] = useState('');
  const [tick, setTick] = useState(0);
  const audio = useRef<AudioContext | null>(null), soundEnabled = useRef(true);
  const stopMelody = useRef<(() => void) | null>(null);
  const seen = useRef<Set<string> | null>(null), active = useRef<AbortController | null>(null);
  const generation = useRef(0), nextCursor = useRef<string | null>(null);
  const run = useRef<(append?: boolean) => Promise<void>>(async () => {});
  const refresh = useCallback(() => { void run.current(); }, []);
  const loadMore = useCallback(() => { void run.current(true); }, []);
  const clearNewOrders = useCallback(() => setNewOrders(0), []);
  const beep = useCallback(() => {
    const context = audio.current;
    if (!soundEnabled.current || !context || volumeRef.current === 0) return;
    if (context.state !== 'running') { setSoundError('Lyden er sat på pause. Tryk på lydknappen for at aktivere den igen.'); return; }
    try {
      stopMelody.current?.();
      const oscillator = context.createOscillator(), gain = context.createGain();
      oscillator.connect(gain); gain.connect(context.destination);
      // Eight notes with a soft attack/release: 3.6 seconds in total.
      const start = context.currentTime;
      const preset = TERMINAL_SOUNDS[soundIdRef.current];
      oscillator.type = preset.wave;
      preset.notes.forEach((frequency, index) => {
        const at = start + index * 0.45;
        oscillator.frequency.setValueAtTime(frequency, at);
        gain.gain.setValueAtTime(0.001, at);
        gain.gain.exponentialRampToValueAtTime(Math.max(0.001, 0.15 * volumeRef.current / 100), at + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, at + 0.42);
      });
      let stopped = false;
      const stop = () => { if (!stopped) { stopped = true; oscillator.stop(); } };
      stopMelody.current = stop;
      oscillator.onended = () => {
        stopped = true; oscillator.disconnect(); gain.disconnect();
        if (stopMelody.current === stop) stopMelody.current = null;
      };
      oscillator.start(start); oscillator.stop(start + 3.6);
    } catch { setSoundError('Lyden kunne ikke afspilles. Nye ordrer vises stadig på skærmen.'); }
  }, []);
  const saveSound = (value: boolean) => { try { localStorage.setItem('orderfly.kds.sound', String(value)); } catch {} };
  const prepareAudio = useCallback(() => {
    const Audio = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Audio) throw new Error('unsupported');
    if (!audio.current || audio.current.state === 'closed') audio.current = new Audio();
    return audio.current;
  }, []);
  const testSound = useCallback(async () => {
    soundEnabled.current = true; setSound(true); saveSound(true);
    try {
      const context = prepareAudio();
      // Safari may leave resume pending until a gesture. Always show the
      // activation state before awaiting it, including on unsupported devices.
      setSoundError('Tryk på “Test lyd” for at aktivere lyden på denne enhed.');
      await context.resume();
      if (!soundEnabled.current) return;
      if (context.state !== 'running') throw new Error('suspended');
      setSoundError(''); beep();
    } catch { setSoundError('Lyden kunne ikke aktiveres. Tryk på “Test lyd” for at prøve igen.'); }
  }, [beep, prepareAudio]);
  const toggleSound = useCallback(async () => {
    if (soundEnabled.current) {
      soundEnabled.current = false; stopMelody.current?.(); setSound(false); setSoundError(''); saveSound(false);
    } else await testSound();
  }, [testSound]);
  const setSoundId = useCallback((value: string) => {
    if (!isTerminalSound(value)) return;
    soundIdRef.current = value; setSoundIdState(value);
    try { localStorage.setItem('orderfly.kds.soundId', value); } catch {}
  }, []);
  const setVolume = useCallback((value: number) => {
    if (!Number.isFinite(value)) return;
    const level = Math.max(0, Math.min(100, Math.round(value)));
    volumeRef.current = level; setVolumeState(level); stopMelody.current?.();
    try { localStorage.setItem('orderfly.kds.volume', String(level)); } catch {}
  }, []);
  useEffect(() => {
    if (!notifications) { soundEnabled.current = false; return; }
    try {
      const savedSound = localStorage.getItem('orderfly.kds.soundId');
      if (isTerminalSound(savedSound)) { soundIdRef.current = savedSound; setSoundIdState(savedSound); }
      const savedVolume = localStorage.getItem('orderfly.kds.volume');
      if (savedVolume !== null && Number.isFinite(Number(savedVolume))) {
        volumeRef.current = Math.max(0, Math.min(100, Number(savedVolume))); setVolumeState(volumeRef.current);
      }
      soundEnabled.current = localStorage.getItem('orderfly.kds.sound') !== 'false';
      setSound(soundEnabled.current);
    } catch {}
    if (!soundEnabled.current) return;
    try {
      const context = prepareAudio();
      if (context.state !== 'running') setSoundError('Tryk på “Test lyd” for at aktivere lyden på denne enhed.');
      const changed = () => {
        if (soundEnabled.current) setSoundError(context.state === 'running' ? '' : 'Tryk på “Test lyd” for at aktivere lyden på denne enhed.');
      };
      context.onstatechange = changed;
      // No startup melody. Notifications start after the first complete snapshot.
      return () => { context.onstatechange = null; };
    } catch { setSoundError('Lyden kunne ikke aktiveres. Tryk på “Test lyd” for at prøve igen.'); }
  }, [notifications, prepareAudio]);
  useEffect(() => {
    const timer = setInterval(() => setTick(t => t + 1), 5_000);
    return () => { clearInterval(timer); soundEnabled.current = false; stopMelody.current?.(); void audio.current?.close(); audio.current = null; };
  }, []);
  useEffect(() => {
    const current = ++generation.current;
    active.current?.abort(); active.current = null;
    const changedKey = previousKey.current !== key; previousKey.current = key;
    lastPushSignal.current = null; setPushConnected(false);
    if (changedKey) { seen.current = null; nextCursor.current = null;
    setAuthorizedRevision(0);
    setData(null); setLastUpdated(null); setNewOrders(0); setError(''); setReconnecting(false); lastSuccessful.current = null; consecutiveFailures.current = 0; setNewPreorders([]); }
    if (!enabled) { setLoading(false); run.current = async () => {}; return; }
    let pendingRefresh = false;
    let disposed = false, timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      if (timer) clearTimeout(timer);
      if (automatic && (query.view === 'board' || !query.view)) {
        if (!push || consecutiveFailures.current > 0) timer = setTimeout(() => void read(), push ? 60_000 : POLL_MS);
      }
    };
    async function read(append = false) {
      if (disposed || (append && !nextCursor.current)) return;
      if (active.current) { if (!append) pendingRefresh = true; return; }
      if (!navigator.onLine) { setOffline(true); setLoading(false); schedule(); return; }
      const controller = new AbortController(); active.current = controller;
      const startedAfterDenial = latestAuthorizationDenial;
      let timeout: ReturnType<typeof setTimeout> | undefined;
      let accessRejected = false;
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
            accessRejected = true;
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
            if (fresh.length) { setNewOrders(n => n + fresh.length); setNewPreorders(fresh.filter(row => isKitchenPreorder(row, Date.parse(result.serverTime), parseKdsSettings(result.kitchenSettings))).map(row => row.id)); beep(); }
          } else seen.current = new Set();
          collected.forEach(order => seen.current!.add(order.id));
          if (seen.current.size > 5_000) seen.current = new Set([...seen.current].slice(-2_500).concat([...collected.keys()]));
        }
        nextCursor.current = result.nextCursor;
        setData(previous => append && !board && previous ? { ...result, orders: [...new Map([...previous.orders, ...result.orders].map(order => [order.id, order])).values()] } : { ...result, orders: [...collected.values()] });
        setAuthorizedRevision(++authorizationRevision);
        lastSuccessful.current = Date.now(); consecutiveFailures.current = 0;
        setLastUpdated(lastSuccessful.current); setOffline(false); setError(''); setReconnecting(false);
      } catch (failure) {
        if (disposed || generation.current !== current) return;
        setOffline(!navigator.onLine);
        consecutiveFailures.current++;
        const snapshotCurrent = query.view && query.view !== 'board' || Date.now() - Math.max(lastSuccessful.current ?? 0, push ? (lastPushSignal.current ?? 0) : 0) < 45_000;
        const retryFresh = !accessRejected && navigator.onLine && consecutiveFailures.current === 1 && lastSuccessful.current !== null && snapshotCurrent;
        setReconnecting(retryFresh);
        if (retryFresh) { pendingRefresh = true; return; }
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
    const wake = () => { if (automatic && document.visibilityState === 'visible') void read(); };
    const online = () => { setOffline(false); if (automatic) void read(); };
    const offlineEvent = () => setOffline(true);
    document.addEventListener('visibilitychange', wake); window.addEventListener('focus', wake);
    window.addEventListener('online', online); window.addEventListener('offline', offlineEvent);
    const stopEvents = automatic && push && query.brandId && query.locationId ? subscribeTerminalEvents(`${endpoint}/events?${new URLSearchParams({ brandId: query.brandId, locationId: query.locationId })}`, {
      signal: () => { if (!disposed) { lastPushSignal.current = Date.now(); setPushConnected(true); } },
      change: () => { if (!disposed) { setChangeRevision(value => value + 1); void read(); } },
      disconnected: () => { if (!disposed) setPushConnected(false); },
      denied: status => {
        if (disposed) return;
        latestAuthorizationDenial = ++authorizationRevision;
        setDeniedRevision(latestAuthorizationDenial); setAuthorizedRevision(0); setData(null); setLastUpdated(null); nextCursor.current = null;
        setDenialMessage(status === 401 ? 'Din session er udløbet. Log ind igen.' : 'Adgangen kontrolleres igen.');
        void read();
      },
    }) : undefined;
    if (changedKey || automatic) void read(); else setLoading(false);
    return () => {
      disposed = true; stopEvents?.(); if (timer) clearTimeout(timer); active.current?.abort(); active.current = null;
      document.removeEventListener('visibilitychange', wake); window.removeEventListener('focus', wake);
      window.removeEventListener('online', online); window.removeEventListener('offline', offlineEvent);
    };
  // Query is serialized so caller object identity does not restart the feed.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, beep, enabled, endpoint, push, automatic]);
  const ageStale = automatic && (!query.view || query.view === 'board') && lastUpdated !== null && Date.now() - Math.max(lastUpdated, push ? (lastPushSignal.current ?? 0) : 0) > 45_000;
  const stale = lastUpdated !== null && (ageStale || offline || !!error);
  void tick;
  return { data, loading, error, changeRevision, newPreorders, reconnecting: reconnecting || (automatic && push && !pushConnected), deniedRevision, authorizedRevision, denialMessage, lastUpdated, offline, stale, newOrders, sound, soundError, refresh, loadMore, clearNewOrders, toggleSound, testSound, volume, setVolume, soundId, setSoundId, alertSound: beep };
}
