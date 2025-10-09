
'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { QaTestcase } from './actions';
import { Play, Edit3, Plus } from 'lucide-react';

function fmt(d: number) {
  const dt = new Date(d);
  return dt.toLocaleString('da-DK');
}

export function QaClientPage({ initialItems }: { initialItems: QaTestcase[] }) {
  const [items] = useState(initialItems);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">QA</h1>
        <Link href="/superadmin/qa/new" className="inline-flex items-center gap-2 rounded-md bg-black px-3 py-2 text-white">
          <Plus className="h-4 w-4" /> Ny testcase
        </Link>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="p-2 text-left">#</th>
              <th className="p-2 text-left">Titel</th>
              <th className="p-2 text-left">Status</th>
              <th className="p-2 text-left">Oprettet</th>
              <th className="p-2 text-left">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((tc, idx) => (
              <tr key={tc.code} className="border-t">
                <td className="p-2">{idx + 1}</td>
                <td className="p-2">{tc.title}</td>
                <td className="p-2">{tc.status}</td>
                <td className="p-2">{fmt(tc.createdAt)}</td>
                <td className="p-2">
                  <Link
                    href={`/superadmin/qa/run/${tc.code}`}
                    className="inline-flex items-center gap-1 rounded border px-2 py-1 mr-2"
                    title="Run"
                  >
                    <Play className="h-4 w-4" /> Run
                  </Link>
                  <Link
                    href={`/superadmin/qa/${tc.code}`}
                    className="inline-flex items-center gap-1 rounded border px-2 py-1"
                    title="Redigér"
                  >
                    <Edit3 className="h-4 w-4" /> Edit
                  </Link>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr><td className="p-2" colSpan={5}>Ingen testcases endnu.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
