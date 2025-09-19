// src/lib/openapi/zod.ts
import "@/lib/openapi/bootstrap"; // <- VIGTIGT: aktiver .openapi() globalt

import { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
// Importér jeres schemas her, fx:
import {
  QuestionOptionSchema,
  QuestionSchema,
  FeedbackQuestionsVersionSchema,
} from "@/lib/schemas/feedback";

export const registry = new OpenAPIRegistry();

// Hvis I vil have navngivne components i spec:
registry.register("QuestionOption", QuestionOptionSchema);
registry.register("Question", QuestionSchema);
registry.register("FeedbackQuestionsVersion", FeedbackQuestionsVersionSchema);
