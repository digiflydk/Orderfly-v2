export type ValidatedFeedbackResponse = {
  type: 'stars' | 'nps' | 'text' | 'tags' | 'multiple_options';
  answer: number | string | string[];
  questionLabel: string;
};

type QuestionRecord = {
  questionId?: unknown;
  label?: unknown;
  type?: unknown;
  isRequired?: unknown;
  options?: unknown;
  minSelection?: unknown;
  maxSelection?: unknown;
};

export type FeedbackResponseValidationResult =
  | { ok: true; responses: Record<string, ValidatedFeedbackResponse> }
  | { ok: false; error: string };

const QUESTION_TYPES = new Set(['stars', 'nps', 'text', 'tags', 'multiple_options']);

function optionLabels(options: unknown): Set<string> {
  if (!Array.isArray(options)) return new Set();
  return new Set(
    options
      .map((option) => option && typeof option === 'object' && typeof (option as { label?: unknown }).label === 'string'
        ? (option as { label: string }).label.trim()
        : '')
      .filter(Boolean),
  );
}

function integerOrNull(value: unknown): number | null {
  const number = Number(value);
  return Number.isInteger(number) ? number : null;
}

export function validateFeedbackResponses(
  questions: unknown,
  responses: Record<string, unknown>,
): FeedbackResponseValidationResult {
  if (!Array.isArray(questions)) return { ok: false, error: 'Feedback form questions are invalid.' };

  const knownIds = new Set<string>();
  const validated: Record<string, ValidatedFeedbackResponse> = {};

  for (const rawQuestion of questions) {
    const question = (rawQuestion ?? {}) as QuestionRecord;
    const questionId = typeof question.questionId === 'string' ? question.questionId.trim() : '';
    const label = typeof question.label === 'string' ? question.label.trim() : '';
    const type = typeof question.type === 'string' ? question.type : '';
    if (!questionId || !label || !QUESTION_TYPES.has(type)) {
      return { ok: false, error: 'Feedback form contains an invalid question.' };
    }
    if (knownIds.has(questionId)) return { ok: false, error: 'Feedback form contains duplicate question ids.' };
    knownIds.add(questionId);

    const incoming = responses[questionId];
    const hasResponse = incoming !== undefined && incoming !== null;
    const isRequired = question.isRequired === true;
    if (!hasResponse) {
      if (isRequired) return { ok: false, error: `Required feedback question is missing: ${label}` };
      continue;
    }
    if (typeof incoming !== 'object' || Array.isArray(incoming)) {
      return { ok: false, error: `Invalid response for: ${label}` };
    }

    const answer = (incoming as { answer?: unknown }).answer;
    if (type === 'stars') {
      const value = integerOrNull(answer);
      if (value === null || value < 1 || value > 5) return { ok: false, error: `Invalid star rating for: ${label}` };
      validated[questionId] = { type: 'stars', answer: value, questionLabel: label };
      continue;
    }

    if (type === 'nps') {
      const value = integerOrNull(answer);
      if (value === null || value < 0 || value > 10) return { ok: false, error: `Invalid NPS score for: ${label}` };
      validated[questionId] = { type: 'nps', answer: value, questionLabel: label };
      continue;
    }

    if (type === 'text') {
      if (typeof answer !== 'string') return { ok: false, error: `Invalid text response for: ${label}` };
      const value = answer.trim();
      if (isRequired && !value) return { ok: false, error: `Required feedback question is empty: ${label}` };
      if (value.length > 5000) return { ok: false, error: `Feedback response is too long: ${label}` };
      if (value) validated[questionId] = { type: 'text', answer: value, questionLabel: label };
      continue;
    }

    if (!Array.isArray(answer)) return { ok: false, error: `Invalid option response for: ${label}` };
    if (answer.length > 50) return { ok: false, error: `Too many selected options for: ${label}` };
    const values = [...new Set(answer.map((value) => typeof value === 'string' ? value.trim() : '').filter(Boolean))];
    if (values.some((value) => value.length > 200)) return { ok: false, error: `Feedback option is too long: ${label}` };

    const allowed = optionLabels(question.options);
    if (allowed.size && values.some((value) => !allowed.has(value))) {
      return { ok: false, error: `Unknown feedback option for: ${label}` };
    }

    const configuredMin = integerOrNull(question.minSelection);
    const configuredMax = integerOrNull(question.maxSelection);
    const minimum = Math.max(isRequired ? 1 : 0, configuredMin ?? 0);
    const maximum = configuredMax !== null && configuredMax > 0 ? configuredMax : null;
    if (values.length < minimum) return { ok: false, error: `Too few selected options for: ${label}` };
    if (maximum !== null && values.length > maximum) return { ok: false, error: `Too many selected options for: ${label}` };

    if (values.length) {
      validated[questionId] = {
        type: type as 'tags' | 'multiple_options',
        answer: values,
        questionLabel: label,
      };
    }
  }

  for (const responseId of Object.keys(responses)) {
    if (!knownIds.has(responseId)) return { ok: false, error: 'Feedback contains a response for an unknown question.' };
  }

  return { ok: true, responses: validated };
}
