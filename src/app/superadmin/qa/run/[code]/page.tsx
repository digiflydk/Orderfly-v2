
import { getQa } from '../../actions';
import { createRunFromTestcase, getRun } from '../actions';
import RunClient from './run-client';

export default async function QaRunPage({ params }: { params: { code: string } }) {
  const tc = await getQa(params.code);
  if (!tc) return <div className="p-6">Testcase ikke fundet.</div>;

  const runId = await createRunFromTestcase(tc);
  const run = await getRun(runId);

  return <RunClient run={run!} />;
}
