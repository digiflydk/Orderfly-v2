import '@/styles/admin-ui.css';
import type { Metadata } from 'next';
export const metadata: Metadata = { title: 'Ordreterminal · Orderfly', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';
export default function TerminalLayout({ children }: { children: React.ReactNode }) {
  return <main className="admin-shell min-h-dvh bg-white p-4 text-slate-900 sm:p-6">{children}</main>;
}
