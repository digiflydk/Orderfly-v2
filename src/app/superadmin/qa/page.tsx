
import { listQa } from './actions';
import { QaClientPage } from './client-page';
import { db } from '@/lib/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';

async function seedInitialTestCase() {
    const docRef = doc(db, "qaTestcases", "OFQ-001");
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
        console.log("Seeding initial test case OFQ-001...");
        const testCaseData = {
          code: "OFQ-001",
          title: "Hele ordreflow (esmeralda)",
          acceptanceCriteria: "Bruger kan gennemføre en standardordre i public webshop:\n(1) Menu viser mindst 1 produkt\n(2) Læg i kurv viser varen i kurven\n(3) Checkout-formular vises med felter for navn og telefon\n(4) Gennemfør ordre viser bekræftelsesside med ordrenummer/kvittering\nAlle betingelser skal opfyldes i ét flow for at casen er Passed.",
          status: "Ready",
          context: "public",
          startPath: "/esmeralda",
          stepsTemplate: [
            { step: 1, title: "Menu vises", criteria: "Menuen skal vise mindst 1 produkt" },
            { step: 2, title: "Læg i kurv", criteria: "Klik på 'Læg i kurv' viser varen i kurven" },
            { step: 3, title: "Checkout formular", criteria: "Checkout-formular vises med felter for navn og telefon" },
            { step: 4, title: "Gennemfør ordre", criteria: "Bekræftelsesside vises med ordrenummer/kvittering" }
          ],
          createdAt: Date.now(),
          updatedAt: Date.now()
        };
        await setDoc(docRef, testCaseData);

        // Also ensure sequence counter is initialized
        const seqRef = doc(db, "qaMeta", "sequence");
        const seqSnap = await getDoc(seqRef);
        if (!seqSnap.exists()) {
            await setDoc(seqRef, { nextNumber: 2 });
        }
    }
}

export default async function QaPage() {
  await seedInitialTestCase();
  const items = await listQa();
  return <QaClientPage initialItems={items} />;
}
