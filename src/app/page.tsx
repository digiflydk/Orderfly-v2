export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "default-no-store";

import PublicLayout from "@/legacy/public/layout";
import PublicPage from "@/legacy/public/page";

export default async function Home() {
  return (
    <PublicLayout>
      <PublicPage />
    </PublicLayout>
  );
}