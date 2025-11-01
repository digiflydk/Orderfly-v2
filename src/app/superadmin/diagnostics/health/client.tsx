// This file is now obsolete and will be removed.
// The logic has been consolidated to prevent build errors.
// Keeping it temporarily to avoid breaking imports during transition.

"use client";

import { useEffect, useState } from "react";

type ProbeResult = {
  ok: boolean;
  ts: number;
  service: string;
  details?: any;
};

export default function DiagnosticsClient() {
  const [probes, setProbes] = useState<{ [key: string]: ProbeResult | null }>({
    "/api/health": null,
    "/api/diag/health": null,
  });

  useEffect(() => {
    async function run() {
      const next: typeof probes = {};
      for (const path of Object.keys(probes)) {
        try {
          const res = await fetch(path);
          const data = await res.json();
          next[path] = { ok: res.ok, ts: Date.now(), service: path, details: data };
        } catch (e: any) {
          next[path] = { ok: false, ts: Date.now(), service: path, details: { error: e.message } };
        }
      }
      setProbes(next);
    }
    run();
  }, []); // Removed probes from dependencies to run only once

  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold mb-4">Diagnostics / Health</h1>
      <table className="w-full text-sm border-collapse">
        <thead className="text-left bg-gray-50">
          <tr>
            <th className="p-2 border">Path</th>
            <th className="p-2 border">Status</th>
            <th className="p-2 border">Timestamp</th>
            <th className="p-2 border">Details</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(probes).map(([path, r]) => (
            <tr key={path} className="border-t">
              <td className="p-2 font-mono">{path}</td>
              <td className="p-2">{r ? (r.ok ? "OK" : "FAIL") : "…"}</td>
              <td className="p-2">{r ? new Date(r.ts).toLocaleTimeString() : "…"}</td>
              <td className="p-2 text-xs">
                <pre>{r?.details ? JSON.stringify(r.details, null, 2) : "…"}</pre>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
