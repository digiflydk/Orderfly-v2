import Link from '@/components/superadmin/admin-link';

export default function FeedbackSettingsPage() {
  return <div className="max-w-2xl space-y-6">
    <h1 className="text-2xl font-bold">Feedbackindstillinger</h1>
    <div role="status" className="rounded-lg border bg-muted p-5 space-y-3">
      <h2 className="font-semibold">Automatisk afsendelse er endnu ikke klar</h2>
      <p>Feedbackmails, påmindelser og automatiske svar er ikke tilsluttet. Der bliver ikke sendt beskeder fra denne side.</p>
      <p>Afsender, mailskabeloner og tidsplan skal færdiggøres og testes, før automatisk feedback kan aktiveres.</p>
    </div>
    <Link href="/superadmin/feedback/questions" className="inline-block underline">Administrér feedbackspørgsmål</Link>
  </div>;
}
