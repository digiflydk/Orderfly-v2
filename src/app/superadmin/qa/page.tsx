import { db } from "@/lib/firebase";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";

type QaCase = {
  id: string;
  number: number;
  title: string;
  status: "open" | "closed";
  createdAt?: number | null;
};

async function seedInitialTestCase() {
  const casesCol = collection(db, "qaCases");
  const firstQ = query(casesCol, orderBy("createdAt", "desc"), limit(1));
  const firstSnap = await getDocs(firstQ);
  if (!firstSnap.empty) return;

  await addDoc(casesCol, {
    number: 1,
    title: "Initial QA testcase",
    status: "open",
    createdAt: Date.now(),
    createdAtServer: serverTimestamp(),
  });

  const seqRef = doc(db, "qaMeta", "sequence");
  const seqSnap = await getDoc(seqRef);
  if (!seqSnap.exists()) {
    await setDoc(seqRef, { nextNumber: 2 });
  }
}

async function listQaCases(): Promise<QaCase[]> {
  const casesCol = collection(db, "qaCases");
  try {
    const q = query(casesCol, orderBy("createdAt", "desc"), limit(100));
    const snap = await getDocs(q);
    return snap.docs.map((d) => {
      const data: any = d.data() ?? {};
      const createdAt =
        typeof data?.createdAt === "number"
          ? data.createdAt
          : data?.createdAt?.toMillis?.() ?? null;

      return {
        id: d.id,
        number: Number(data?.number ?? 0),
        title: String(data?.title ?? ""),
        status: (data?.status as "open" | "closed") ?? "open",
        createdAt,
      };
    });
  } catch {
    const snap = await getDocs(query(casesCol, limit(100)));
    return snap.docs.map((d) => {
      const data: any = d.data() ?? {};
      const createdAt =
        typeof data?.createdAt === "number"
          ? data.createdAt
          : data?.createdAt?.toMillis?.() ?? null;

      return {
        id: d.id,
        number: Number(data?.number ?? 0),
        title: String(data?.title ?? ""),
        status: (data?.status as "open" | "closed") ?? "open",
        createdAt,
      };
    });
  }
}

export default async function QaPage() {
  await seedInitialTestCase();
  const items = await listQaCases();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">QA</h1>
        <p className="text-sm text-muted-foreground">
          Testcases til gennemgang og verifikation.
        </p>
      </div>

      <div className="rounded-xl border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="px-4 py-3 font-medium">#</th>
                <th className="px-4 py-3 font-medium">Titel</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Oprettet</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-muted-foreground" colSpan={4}>
                    Ingen QA-cases fundet.
                  </td>
                </tr>
              ) : (
                items.map((c) => (
                  <tr key={c.id} className="border-t">
                    <td className="px-4 py-3">{c.number}</td>
                    <td className="px-4 py-3">{c.title}</td>
                    <td className="px-4 py-3">{c.status}</td>
                    <td className="px-4 py-3">
                      {c.createdAt ? new Date(c.createdAt).toLocaleString("da-DK") : "-"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
