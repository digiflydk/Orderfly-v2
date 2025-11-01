// This file is now obsolete and will be removed.
// The logic has been consolidated to prevent build errors.
// Keeping it temporarily to avoid breaking imports during transition.

export const runtime = "nodejs";
export const revalidate = 0;
export const dynamic = 'force-dynamic';

import DiagnosticsClient from "./client";

export default function Page() {
  return <DiagnosticsClient />;
}
