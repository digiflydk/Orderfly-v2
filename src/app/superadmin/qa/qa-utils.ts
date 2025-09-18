
export type QaStepTemplate = {
  step: number;            // 1-based
  title: string;           // fx "Menu vises"
  criteria: string;        // acceptance pr step
};

// hver linje: Title | Criteria
// tomme linjer ignoreres. step nummereres automatisk 1..N
export function parseStepsInput(raw: string): QaStepTemplate[] {
  const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
  return lines.map((line, i) => {
    const [title, criteria] = line.split('|').map(s => (s ?? '').trim());
    return { step: i + 1, title, criteria };
  });
}

export function stringifySteps(steps: QaStepTemplate[]): string {
  if (!steps) return '';
  return steps.map(s => `${s.title} | ${s.criteria}`).join('\n');
}
