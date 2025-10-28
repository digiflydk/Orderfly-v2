import Link from "next/link";
import { isM3Enabled } from "@/lib/feature-flags";

export const runtime = "nodejs";

export default function M3IndexPage() {
  if (!isM3Enabled()) {
    return (
      <main className="space-y-2">
        <h1 className="text-2xl font-semibold">M3 disabled</h1>
        <p>Sæt <code>NEXT_PUBLIC_M3_PREVIEW=true</code> i env for at aktivere preview.</p>
      </main>
    );
  }

  return (
    <main className="space-y-4">
      <h1 className="text-2xl font-semibold">M3 (Preview)</h1>
      <p>Dette er en placeholder for M3-frontend.</p>

      <div>
        <p className="mb-2">Eksempel-route:</p>
        <Link
          href="/m3pizza/m3-pizza-hellerup"
          className="inline-block rounded bg-black text-white px-3 py-2"
        >
          Åbn Esmeralda – Amager (mock)
        </Link>
      </div>
    </main>
  );
}
