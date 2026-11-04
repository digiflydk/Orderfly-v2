'use client';
import { useEffect, useState } from 'react';
import { getClubSessionProfileAction, type ClubSessionProfile } from '@/app/club-session-actions';

/** The signed-in Club member for this brand (or { signedIn: false }). Rechecked when the tab regains focus. */
export function useClubSession(brandSlug: string | null | undefined): ClubSessionProfile {
  const [session, setSession] = useState<ClubSessionProfile>({ signedIn: false });
  useEffect(() => {
    if (!brandSlug) return;
    let current = true;
    const check = () => { getClubSessionProfileAction(brandSlug).then(result => { if (current) setSession(result); }).catch(() => {}); };
    check();
    window.addEventListener('focus', check);
    return () => { current = false; window.removeEventListener('focus', check); };
  }, [brandSlug]);
  return session;
}

export function useClubSignedIn(brandSlug: string | null | undefined): boolean {
  return useClubSession(brandSlug).signedIn;
}
