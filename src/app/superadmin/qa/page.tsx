
import { listQa, createQa, getQa } from './actions';
import { QaClientPage } from './client-page';
import type { QaTestcase } from './actions';

// --- One-time data seeding for OFQ-001 ---
async function seedInitialTestCase() {
  const testCaseCode = 'OFQ-001';
  const existingTest = await getQa(testCaseCode);
  
  // Only create if it doesn't exist to prevent duplicates
  if (!existingTest) {
    console.log(`Seeding initial test case: ${testCaseCode}`);
    const testCaseData: Omit<QaTestcase, 'code' | 'createdAt' | 'updatedAt'> = {
      title: "Hele ordreflow (esmeralda)",
      acceptanceCriteria: "Bruger kan gennemføre en standardordre i public webshop:\n(1) Menu viser mindst 1 produkt\n(2) Læg i kurv viser varen i kurven\n(3) Checkout-formular vises med felter for navn og telefon\n(4) Gennemfør ordre viser bekræftelsesside med ordrenummer/kvittering\nAlle betingelser skal opfyldes i ét flow for at casen er Passed.",
      status: "Ready",
      context: "public",
      startPath: "/esmeralda",
      stepsTemplate: [
        { "step": 1, "title": "Menu vises", "criteria": "Menuen skal vise mindst 1 produkt" },
        { "step": 2, "title": "Læg i kurv", "criteria": "Når jeg klikker 'Læg i kurv' på et produkt, skal varen vises i kurven" },
        { "step": 3, "title": "Checkout formular", "criteria": "Når jeg går til kassen, skal checkout-formularen vises med felter for navn og telefon" },
        { "step": 4, "title": "Gennemfør ordre", "criteria": "Når jeg indsender formularen, skal en bekræftelsesside vises med ordrenummer/kvittering" }
      ],
    };

    // We can't use the real createQa here as it would create OFQ-002, OFQ-003 etc.
    // We need to specifically create OFQ-001 if it's the first one.
    // This is a simplified version of createQa for seeding.
    const now = Date.now();
    const { db } = await import('@/lib/firebase');
    const { doc, setDoc } = await import('firebase/firestore');
    
    // Also initialize the sequence counter if it doesn't exist
    const seqRef = doc(db, 'qaMeta', 'sequence');
    const seqSnap = await getDoc(seqRef);
    if (!seqSnap.exists()) {
        await setDoc(seqRef, { nextNumber: 2 });
    }

    const docRef = doc(db, 'qaTestcases', testCaseCode);
    await setDoc(docRef, { ...testCaseData, code: testCaseCode, createdAt: now, updatedAt: now });

    console.log('Seeding complete.');
  }
}


export default async function QaPage() {
  await seedInitialTestCase();
  const items = await listQa();
  return <QaClientPage initialItems={items} />;
}
