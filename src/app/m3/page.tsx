import Link from "next/link";
import { isM3Enabled } from "@/lib/feature-flags";

export const runtime = "nodejs";

export default function M3IndexPage() {
  // Debug-log for at bekræfte at env-flagget læses korrekt
  console.log("M3_PREVIEW =", process.env.NEXT_PUBLIC_M3_PREVIEW);

  if (!isM3Enabled()) {
    return (
      <main className="space-y-2 p-6">
        <h1 className="text-2xl font-semibold text-red-600">M3 disabled</h1>
        <p>
          Sæt <code>NEXT_PUBLIC_M3_PREVIEW=true</code> i <code>.env.local</code> for at
          aktivere preview.
        </p>
      </main>
    );
  }

  return (
    <main className="space-y-4 p-6">
      <h1 className="text-2xl font-semibold">M3 (Preview)</h1>
      <p>Dette er en placeholder for M3-frontend.</p>

      <div className="space-y-2">
        <p>Eksempel-route:</p>
        <Link
          href="/m3/esmeralda/esmeralda-pizza-amager"
          className="inline-block rounded bg-black text-white px-3 py-2 hover:bg-neutral-800 transition"
        >
          Åbn Esmeralda – Amager (mock)
        </Link>
      </div>
    </main>
  );
}
