import { redirect } from 'next/navigation';

// The retired marketing site is replaced by the standard takeaway entry point.
export default function RetiredMarketingPage() {
  redirect('/');
}
