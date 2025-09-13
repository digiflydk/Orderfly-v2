import { ContactForm } from './ContactForm';
import { Suspense } from 'react';

// OF-412: Prevent build-time prerendering for this page
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default function ContactPage() {
  return (
    <Suspense>
      <ContactForm />
    </Suspense>
  );
}
