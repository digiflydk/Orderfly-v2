'use client';

import NextLink, { useLinkStatus } from 'next/link';
import { forwardRef, type ComponentProps } from 'react';
import { PendingFeedback } from './pending-feedback';

export function LinkPendingFeedback() {
  const { pending } = useLinkStatus();
  return pending ? <PendingFeedback /> : null;
}

// Keep Next's navigation, prefetch, cancellation and modified-click semantics.
// The feedback follows the router's pending state, not a click timer.
const AdminLink = forwardRef<HTMLAnchorElement, ComponentProps<typeof NextLink>>(
  function AdminLink({ children, ...props }, ref) {
    return <NextLink {...props} ref={ref}>{children}<LinkPendingFeedback /></NextLink>;
  }
);

export default AdminLink;
