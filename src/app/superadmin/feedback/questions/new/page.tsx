// src/app/superadmin/feedback/questions/new/page.tsx
import React from "react";
import FeedbackQuestionNewForm from "@/components/superadmin/feedback-question-new-form";

export const metadata = {
  title: "New Feedback Question",
};

export default async function Page() {
  // Server Component – ingen direkte form-state her.
  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-semibold mb-4">Create Feedback Question</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Opret et nyt spørgsmål inkl. type, svarmuligheder, hjælpetekst, sprog og status.
      </p>
      <FeedbackQuestionNewForm />
    </div>
  );
}
