'use client';

import { useEffect, useState } from 'react';
import type { QaStepTemplate } from '@/app/superadmin/qa/actions';

type Props = {
  initial?: QaStepTemplate[];
  onChange: (steps: QaStepTemplate[]) => void;
};

export default function StepsEditor({ initial, onChange }: Props) {
  const [steps, setSteps] = useState<QaStepTemplate[]>(
    initial?.length ? initial : []
  );

  useEffect(() => {
    onChange(steps.map((s, i) => ({ ...s, step: i + 1 })));
  }, [steps, onChange]);

  function addStep() {
    setSteps(prev => [...prev, { step: prev.length + 1, title: '', criteria: '' }]);
  }

  function updateStep(i: number, patch: Partial<QaStepTemplate>) {
    setSteps(prev => prev.map((s, idx) => idx === i ? { ...s, ...patch } : s));
  }

  function removeStep(i: number) {
    setSteps(prev => prev.filter((_, idx) => idx !== i).map((s, idx) => ({ ...s, step: idx + 1 })));
  }

  function moveUp(i: number) {
    if (i === 0) return;
    setSteps(prev => {
      const arr = [...prev];
      [arr[i - 1], arr[i]] = [arr[i], arr[i - 1]];
      return arr.map((s, idx) => ({ ...s, step: idx + 1 }));
    });
  }

  function moveDown(i: number) {
    if (i === steps.length - 1) return;
    setSteps(prev => {
      const arr = [...prev];
      [arr[i], arr[i + 1]] = [arr[i + 1], arr[i]];
      return arr.map((s, idx) => ({ ...s, step: idx + 1 }));
    });
  }

  return (
    <div className="space-y-3">
      {steps.length === 0 && (
        <div className="text-sm text-gray-500">Ingen steps endnu – tilføj dit første step.</div>
      )}

      {steps.map((s, i) => (
        <div key={i} className="rounded border p-3 space-y-2">
          <div className="text-xs text-gray-500">Step #{i + 1}</div>
          <div>
            <label className="block text-sm font-medium">Titel</label>
            <input
              className="mt-1 w-full rounded border p-2"
              placeholder="fx: Menu vises"
              value={s.title}
              onChange={e => updateStep(i, { title: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm font-medium">Acceptance (kriterie)</label>
            <input
              className="mt-1 w-full rounded border p-2"
              placeholder="fx: Menuen skal vise mindst 1 produkt"
              value={s.criteria}
              onChange={e => updateStep(i, { criteria: e.target.value })}
            />
          </div>
          <div className="flex gap-2">
            <button type="button" className="rounded border px-2 py-1" onClick={() => moveUp(i)}>Op</button>
            <button type="button" className="rounded border px-2 py-1" onClick={() => moveDown(i)}>Ned</button>
            <button type="button" className="ml-auto rounded border px-2 py-1" onClick={() => removeStep(i)}>Slet</button>
          </div>
        </div>
      ))}

      <button type="button" className="rounded bg-black px-3 py-2 text-white" onClick={addStep}>
        Tilføj step
      </button>
    </div>
  );
}
