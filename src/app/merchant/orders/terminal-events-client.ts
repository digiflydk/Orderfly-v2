/** Cookie-authenticated SSE with bounded buffers, heartbeat timeout and backoff. */
export function subscribeTerminalEvents(url: string, handlers: {
  signal: () => void; change: () => void; disconnected: () => void; denied: (status: number) => void;
}) {
  let stopped = false, controller: AbortController | undefined, retry: ReturnType<typeof setTimeout> | undefined;
  let failures = 0;
  const connect = async () => {
    if (stopped) return;
    controller = new AbortController();
    let watchdog: ReturnType<typeof setTimeout> | undefined, graceful = false;
    const alive = () => { clearTimeout(watchdog); watchdog = setTimeout(() => controller?.abort(), 45_000); };
    alive();
    try {
      const response = await fetch(url, { credentials: 'same-origin', cache: 'no-store', signal: controller.signal });
      if (response.status === 401 || response.status === 403) { handlers.denied(response.status); throw Error('access'); }
      if (!response.ok || !response.headers.get('content-type')?.includes('text/event-stream') || !response.body) throw Error('stream');
      const reader = response.body.getReader(), decoder = new TextDecoder();
      let buffer = '';
      while (!stopped) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
        if (buffer.length > 64_000) throw Error('oversize');
        let end: number;
        while ((end = buffer.indexOf('\n\n')) !== -1) {
          const event = /^event: (\w+)$/m.exec(buffer.slice(0, end))?.[1];
          buffer = buffer.slice(end + 2);
          if (event === 'ready' || event === 'heartbeat' || event === 'change') {
            alive(); failures = 0; handlers.signal();
            if (event !== 'heartbeat') handlers.change();
          } else if (event === 'access') { handlers.denied(403); throw Error('access'); }
          else if (event === 'unavailable') throw Error('stream');
          else if (event === 'reconnect') { graceful = true; break; }
        }
        if (graceful) break;
      }
    } catch { /* The feed retains explicit authorization rejection separately. */ }
    finally {
      controller.abort(); clearTimeout(watchdog);
      if (!stopped) {
        if (!graceful) handlers.disconnected();
        retry = setTimeout(() => void connect(), graceful ? 0 : Math.min(30_000, 1000 * 2 ** Math.min(failures++, 5)));
      }
    }
  };
  void connect();
  return () => { stopped = true; controller?.abort(); clearTimeout(retry); };
}
