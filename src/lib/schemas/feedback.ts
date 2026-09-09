import { z } from "zod";

export const QuestionOptionSchema = z.object({
  value: z.string().max(200).optional(),
  id: z.string().trim().min(1).max(100),
  label: z.string().trim().min(1).max(200),
});

export const QuestionSchema = z.object({
  questionId: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/, 'Invalid question ID').refine(id => !['__proto__', 'constructor', 'prototype'].includes(id), 'Reserved question ID'),
  label: z.string().trim().min(1).max(200),
  type: z.enum(["stars", "nps", "text", "tags", "multiple_options"]),
  isRequired: z.boolean(),
  options: z.array(QuestionOptionSchema).max(50).optional(),
  minSelection: z.number().int().min(0).max(50).optional(),
  maxSelection: z.number().int().min(0).max(50).optional(),
});

export const FeedbackQuestionsVersionSchema = z.object({
  id: z.string().optional(),
  versionLabel: z.string().trim().min(1).max(200),
  isActive: z.boolean(),
  language: z.string().trim().min(2).max(16).default("da"),
  orderTypes: z.array(z.enum(["pickup", "delivery", "booking"])).min(1).max(3),
  questions: z.array(QuestionSchema).min(1).max(50),
  createdAt: z.any().optional(),
  updatedAt: z.any().optional(),
}).superRefine((version, context) => {
  const ids = new Set<string>();
  version.questions.forEach((question, index) => {
    const error = (message: string) => context.addIssue({ code: z.ZodIssueCode.custom, path: ['questions', index], message });
    if (ids.has(question.questionId)) error('Question IDs must be unique.');
    ids.add(question.questionId);
    if (question.type === 'tags' || question.type === 'multiple_options') {
      const options = question.options || [];
      if (!options.length) error('Add at least one option.');
      if (new Set(options.map(o => o.id)).size !== options.length || new Set(options.map(o => o.label)).size !== options.length) error('Option IDs and labels must be unique.');
      const min = Math.max(question.isRequired ? 1 : 0, question.minSelection || 0);
      const max = question.maxSelection || options.length;
      if (min > max || max > options.length) error('Selection limits must match the available options.');
    }
  });
});

export type QuestionOption = z.infer<typeof QuestionOptionSchema>;
export type Question = z.infer<typeof QuestionSchema>;
export type FeedbackQuestionsVersion = z.infer<typeof FeedbackQuestionsVersionSchema>;
