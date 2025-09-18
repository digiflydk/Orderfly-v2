
'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { QaTestcase } from './actions';

export function QaClientPage({ initialItems }: { initialItems: QaTestcase[] }) {
  const [items] = useState(initialItems);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">QA · Testcases</h1>
        <div className="flex gap-2">
          <button onClick={() => alert('Run all (stub) – kommer i næste opgave')} className="rounded-md border px-3 py-2">Kør alle (stub)</button>
          <Link href="/superadmin/qa/new" className="rounded-md bg-black px-3 py-2 text-white">Ny testcase</Link>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="p-2 text-left">Code</th>
              <th className="p-2 text-left">Title</th>
              <th className="p-2 text-left">Status</th>
              <th className="p-2 text-left">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map(tc => (
              <tr key={tc.code} className="border-t">
                <td className="p-2">{tc.code}</td>
                <td className="p-2">{tc.title}</td>
                <td className="p-2">{tc.status}</td>
                <td className="p-2">
                  <Link className="underline" href={`/superadmin/qa/${tc.code}`}>Edit</Link>
                  <Link className="ml-3 underline" href={`/superadmin/qa/run/${tc.code}`}>Run</Link>
                </td>
              </tr>
            ))}
            {items.length === 0 && <tr><td className="p-2" colSpan={4}>Ingen testcases endnu.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
