import { getQa } from '../../actions';
import { createRunFromTestcase, getRun } from '../actions';
import RunClient from './run-client';

export default async function QaRunPage({ params }: { params: { code: string } }) {
  // Hent testcase
  const tc = await getQa(params.code);
  if (!tc) return <div className="p-6">Testcase ikke fundet.</div>;

  // Opret nyt run hver gang siden åbnes (enkelt og deterministisk for agenten)
  const runId = await createRunFromTestcase(tc);
  const run = await getRun(runId);

  return <RunClient run={run!} />;
}
