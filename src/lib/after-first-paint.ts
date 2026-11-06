/** Schedule optional work after a paint, with a bounded idle wait and complete cleanup. */
export function afterFirstPaint(work: () => void): () => void {
  let cancelled = false, frame = 0, idle: number | undefined, timer: number | undefined;
  const run = () => { if (!cancelled) work(); };
  frame = window.requestAnimationFrame(() => {
    frame = window.requestAnimationFrame(() => {
      if (typeof window.requestIdleCallback === 'function') idle = window.requestIdleCallback(run, { timeout: 1500 });
      else timer = window.setTimeout(run, 0);
    });
  });
  return () => {
    cancelled = true;
    window.cancelAnimationFrame(frame);
    if (idle !== undefined) window.cancelIdleCallback(idle);
    if (timer !== undefined) window.clearTimeout(timer);
  };
}
