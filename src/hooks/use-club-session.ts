'use client';
import { useEffect, useState } from 'react';
import { getClubSessionStatusAction } from '@/app/club-session-actions';

/** True when this browser is signed in to the brand's Club. Rechecked when the tab regains focus. */
export function useClubSignedIn(brandSlug: string | null | undefined): boolean {
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    if (!brandSlug) return;
    let current = true;
    const check = () => { getClubSessionStatusAction(brandSlug).then(result => { if (current) setSignedIn(result.signedIn); }).catch(() => {}); };
    check();
    window.addEventListener('focus', check);
    return () => { current = false; window.removeEventListener('focus', check); };
  }, [brandSlug]);
  return signedIn;
}
