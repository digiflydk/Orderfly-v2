'use server';

import { revalidatePath } from 'next/cache';
import {
  getDullyFeedbackState, configureDullyFeedback, importDullyFeedback,
  sendDullyFeedbackTest, approveDullyFeedback, setDullyFeedbackPaused,
} from '@/lib/feedback/dully-admin';

type Scope = { brandId: string; locationId: string };

export async function loadDullyFeedback(scope: Scope) {
  try { return { ok: true as const, state: await getDullyFeedbackState(scope.brandId, scope.locationId) }; }
  catch { return { ok: false as const, message: 'Kunne ikke hente Dully-feedback. Kontrollér din adgang og prøv igen.' }; }
}

async function changed<T>(scope: Scope, operation: () => Promise<T>, message: string | ((result: T) => string)) {
  try {
    const result = await operation();
    const statusMessage = typeof message === 'function' ? message(result) : message;
    try { revalidatePath('/superadmin/feedback/dully'); } catch {}
    // A successful write is still successful if a following status read fails.
    const current = await loadDullyFeedback(scope);
    return current.ok
      ? { ok: true as const, message: statusMessage, state: current.state }
      : { ok: true as const, message: statusMessage + ' Opdatér status for at se resultatet.', state: null };
  } catch {
    return { ok: false as const, message: 'Handlingen kunne ikke gennemføres. Kontrollér felter, adgang og den aktuelle teststatus. Dine indtastninger er bevaret.' };
  }
}

export async function saveDullyConfiguration(input: Scope & { accountId: string; restaurantId: string }) {
  return changed(input, () => configureDullyFeedback(input), 'Dully-kontoen og restauranten er knyttet til den valgte location.');
}

export async function importDullyOrders(input: Scope & { json: string }) {
  if (typeof input.json !== 'string' || input.json.length > 500000) return { ok: false as const, message: 'Importen er for stor. Brug højst 100 ordrer ad gangen.' };
  let rows: unknown;
  try { rows = JSON.parse(input.json); } catch { return { ok: false as const, message: 'Indsæt gyldig JSON med en liste af ordrer.' }; }
  if (!Array.isArray(rows) || !rows.length || rows.length > 100) return { ok: false as const, message: 'Importen skal indeholde mellem 1 og 100 ordrer.' };
  return changed(input, () => importDullyFeedback({ brandId: input.brandId, locationId: input.locationId, rows }), result =>
    `Import behandlet: ${result.imported} nye, ${result.updated} opdaterede og ${result.unchanged} uændrede ordrer. ${result.skipped} ordrer opfylder ikke kravene til afsendelse.`);
}

export async function sendDullyTest(input: Scope & { experienceType: 'pickup' | 'delivery' }) {
  return changed(input, () => sendDullyFeedbackTest(input), 'Testmailen er registreret til ok@esmeraldapizza.dk. En eksisterende test genbruges uden ny afsendelse. Se den aktuelle status nedenfor.');
}

export async function approveDullyTest(input: Scope & { testSourceId: string; confirmed: boolean }) {
  if (input.confirmed !== true) return { ok: false as const, message: 'Bekræft først, at du har modtaget og godkendt testmailen og skemaet.' };
  return changed(input, () => approveDullyFeedback(input), 'Testen er godkendt. Du kan nu aktivere den daglige afsendelse.');
}

export async function pauseDullyFeedback(input: Scope & { paused: boolean }) {
  return changed(input, () => setDullyFeedbackPaused(input), input.paused ? 'Dully-afsendelse er sat på pause.' : 'Daglig Dully-afsendelse er aktiveret.');
}
