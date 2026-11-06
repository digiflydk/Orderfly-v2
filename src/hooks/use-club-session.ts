'use client';
import { useEffect, useState } from 'react';
import { getClubSessionProfileAction, type ClubSessionProfile } from '@/app/club-session-actions';
import { afterFirstPaint } from '@/lib/after-first-paint';

/** The signed-in Club member for this brand (or { signedIn: false }). Rechecked when the tab regains focus. */
export function useClubSession(brandSlug: string | null | undefined, defer = false): ClubSessionProfile {
  const [session, setSession] = useState<ClubSessionProfile>({ signedIn: false });
  useEffect(() => {
    if (!brandSlug) return;
    let current = true;
    const check = () => { getClubSessionProfileAction(brandSlug).then(result => { if (current) setSession(result); }).catch(() => {}); };
    const cancel = defer ? afterFirstPaint(check) : (check(), () => {});
    window.addEventListener('focus', check);
    return () => { current = false; cancel(); window.removeEventListener('focus', check); };
  }, [brandSlug, defer]);
  return session;
}

export function useClubSignedIn(brandSlug: string | null | undefined): boolean {
  return useClubSession(brandSlug).signedIn;
}
