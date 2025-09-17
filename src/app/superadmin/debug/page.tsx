"use client";

import { useEffect, useState } from "react";
import { DEBUG_COLLECTIONS, DEBUG_DEFAULT_PAGE_SIZE } from "@/config/debug";

type Row = { id: string; [k: string]: any };

export default function Page() {
  const [path, setPath] = useState<string>(DEBUG_COLLECTIONS[0] || "");
  const [items, setItems] = useState<Row[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [ordered, setOrdered] = useState<boolean>(true);

  async function fetchPage(reset=false) {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      qs.set("path", path);
      qs.set("limit", String(DEBUG_DEFAULT_PAGE_SIZE));
      if (nextCursor && !reset) qs.set("after", nextCursor);
      const res = await fetch(`/api/debug/snapshot?${qs.toString()}`);
      const data = await res.json();
      if (reset) {
        setItems(data.items || []);
      } else {
        setItems(prev => [...prev, ...(data.items || [])]);
      }
      setNextCursor(data.nextCursor || null);
      setOrdered(Boolean(data.orderedByCreatedAt));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setItems([]);
    setNextCursor(null);
    fetchPage(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">System Debug Snapshot</h1>
        <p className="text-sm text-muted-foreground">Read-only overblik (PII maskeret). Brug dropdown for at vælge kollektion.</p>
      </div>

      <div className="flex items-center gap-3">
        <select className="border rounded px-2 py-1" value={path} onChange={e => setPath(e.target.value)}>
          {DEBUG_COLLECTIONS.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <button disabled={loading} className="border rounded px-3 py-1" onClick={() => fetchPage(true)}>
          Refresh
        </button>
      </div>

      <div className="rounded-xl border">
        <div className="px-4 py-3 border-b text-sm font-medium">
          {path} • {items.length} viste {ordered ? "• ordered by createdAt" : ""}
        </div>
        <div className="p-4">
          <pre className="text-xs bg-muted/40 rounded p-3 overflow-x-auto">{JSON.stringify(items, null, 2)}</pre>
          <div className="mt-3">
            {nextCursor ? (
              <button disabled={loading} className="border rounded px-3 py-1" onClick={() => fetchPage(false)}>
                Load more
              </button>
            ) : (
              <span className="text-sm text-muted-foreground">Ingen flere dokumenter.</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
