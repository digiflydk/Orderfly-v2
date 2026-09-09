"use client";

import Link from '@/components/superadmin/admin-link';

import type { FeedbackQuestionsVersion } from '@/types';
import { feedbackDate } from '@/lib/feedback/display';
type Version = FeedbackQuestionsVersion & { createdAt?: Date | string | number };

export default function FeedbackQuestionsClientPage({
  initialVersions,
}: {
  initialVersions: Version[];
}) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Feedback Questions</h1>
          <p className="text-sm text-muted-foreground">
            Administrér spørgsmålsversioner til feedback.
          </p>
        </div>
        <Link
          href="/superadmin/feedback/questions/new"
          className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          Opret spørgsmål
        </Link>
      </div>

      <div className="rounded-xl border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="px-4 py-3 font-medium">ID</th>
                <th className="px-4 py-3 font-medium">Sprog</th>
                <th className="px-4 py-3 font-medium">Oplevelse</th>
                <th className="px-4 py-3 font-medium">Label</th>
                <th className="px-4 py-3 font-medium">Created</th>
                <th className="px-4 py-3 font-medium">Active</th>
                <th className="px-4 py-3 font-medium">Handling</th>
              </tr>
            </thead>
            <tbody>
              {!initialVersions || initialVersions.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-muted-foreground" colSpan={7}>
                    Ingen spørgsmålsversioner fundet.
                  </td>
                </tr>
              ) : (
                initialVersions.map((q) => (
                  <tr key={q.id} className="border-t">
                    <td className="px-4 py-3">{q.id}</td>
                    <td className="px-4 py-3">{q.language || "-"}</td>
                    <td className="px-4 py-3">{q.orderTypes?.join(', ') || '-'}</td>
                    <td className="px-4 py-3">{q.versionLabel || "-"}</td>
                    <td className="px-4 py-3">
                      {feedbackDate(q.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      {q.isActive === true ? "Yes" : q.isActive === false ? "No" : "-"}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/superadmin/feedback/questions/edit/${q.id}`}
                        className="rounded-md border px-2 py-1 text-xs hover:bg-muted"
                      >
                        Rediger
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
