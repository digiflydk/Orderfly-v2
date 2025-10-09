import { z } from "zod";

export const QuestionOptionSchema = z.object({
  id: z.string(),
  label: z.string(),
});

export const QuestionSchema = z.object({
  questionId: z.string(),
  label: z.string(),
  type: z.enum(["stars", "nps", "text", "tags", "multiple_options"]),
  isRequired: z.boolean(),
  options: z.array(QuestionOptionSchema).optional(),
  minSelection: z.number().optional(),
  maxSelection: z.number().optional(),
});

export const FeedbackQuestionsVersionSchema = z.object({
  id: z.string().optional(),
  versionLabel: z.string(),
  isActive: z.boolean(),
  language: z.string().default("da"),
  orderTypes: z.array(z.enum(["pickup", "delivery"])),
  questions: z.array(QuestionSchema),
  createdAt: z.any().optional(),
  updatedAt: z.any().optional(),
});

export type QuestionOption = z.infer<typeof QuestionOptionSchema>;
export type Question = z.infer<typeof QuestionSchema>;
export type FeedbackQuestionsVersion = z.infer<typeof FeedbackQuestionsVersionSchema>;
