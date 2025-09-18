'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@/lib/firebase';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import type { QaTestcase, QaStepTemplate } from '../actions';

export type RunStepStatus = 'Pending' | 'Approved' | 'Failed';

export type RunStep = QaStepTemplate & {
  status: RunStepStatus;
  errorNote?: string;
  proofUrl?: string;
};

export type QaRun = {
  runId: string;       // fx `${code}-${Date.now()}`
  code: string;        // testcase code
  startedAt: number;
  finishedAt?: number;
  steps: RunStep[];    // samlet status pr step
};

function buildRunId(code: string) {
  return `${code}-${Date.now()}`;
}

export async function createRunFromTestcase(tc: QaTestcase): Promise<string> {
  const runId = buildRunId(tc.code);
  const steps: RunStep[] = tc.stepsTemplate.map(s => ({ ...s, status: 'Pending' }));
  const run: QaRun = {
    runId,
    code: tc.code,
    startedAt: Date.now(),
    steps,
  };
  await setDoc(doc(db, 'qaRuns', runId), run);
  return runId;
}

export async function getRun(runId: string): Promise<QaRun | null> {
  const snap = await getDoc(doc(db, 'qaRuns', runId));
  return snap.exists() ? (snap.data() as QaRun) : null;
}

export async function setStepStatus(runId: string, stepIndex: number, status: RunStepStatus, errorNote?: string, proofUrl?: string) {
  const ref = doc(db, 'qaRuns', runId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('Run not found');
  const data = snap.data() as QaRun;
  const steps = [...data.steps];

  steps[stepIndex] = {
    ...steps[stepIndex],
    status,
    errorNote: status === 'Failed' ? (errorNote || '') : undefined,
    proofUrl: status === 'Failed' ? (proofUrl || '') : undefined,
  };

  await updateDoc(ref, { steps });
  revalidatePath(`/superadmin/qa/run/${data.code}`);
}

export async function finishRun(runId: string) {
  const ref = doc(db, 'qaRuns', runId);
  await updateDoc(ref, { finishedAt: Date.now() });
}
