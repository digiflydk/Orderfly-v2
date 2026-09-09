'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
export function PublicReviewsLink({ brandId, href }: { brandId: string; href: string }) {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    const controller = new AbortController(); setEnabled(false);
    fetch(`/api/reviews/status?brandId=${encodeURIComponent(brandId)}`, { signal: controller.signal, cache: 'no-store' })
      .then(r => r.ok ? r.json() : null).then(data => { if (!controller.signal.aborted) setEnabled(data?.enabled === true); }).catch(() => {});
    return () => controller.abort();
  }, [brandId]);
  return enabled ? <Link className="mt-3 inline-flex min-h-11 items-center underline underline-offset-4" href={href}>Se anmeldelser</Link> : null;
}
