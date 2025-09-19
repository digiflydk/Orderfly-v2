import { OpenAPIRegistry } from "zod-to-openapi";
import {
  QuestionOptionSchema,
  QuestionSchema,
  FeedbackQuestionsVersionSchema,
} from "@/lib/schemas/feedback";

export const registry = new OpenAPIRegistry();

// Registrer alle feedback-relaterede schemas
registry.register("QuestionOption", QuestionOptionSchema);
registry.register("Question", QuestionSchema);
registry.register("FeedbackQuestionsVersion", FeedbackQuestionsVersionSchema);
