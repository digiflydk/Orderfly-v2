import 'server-only';
import type { Firestore } from 'firebase-admin/firestore';
import { z } from 'zod';
import { authorize, policySchema, type Policy } from '@/lib/access/policy';
import { principalKey, type VerifiedIdentity } from '@/lib/access/authority';
import { authorizeTransaction } from '@/lib/access/scoped-data';
import { LoyaltyError } from './counter';
import { cardIsExpired, COLLECTIONS, EVENT_TYPES, hashKey, readProgram, type CardDoc, type LoyaltyEvent, type MemberDoc, type RewardDoc } from './model';
import { programSettingsSchema, type ProgramSettings } from './rules';

export type AdminActor = { identity: VerifiedIdentity; name: string };
export const ADMIN_PERMISSION = {
  settings: 'orderfly.stamp_cards:settings', members: 'orderfly.stamp_cards:members', log: 'orderfly.stamp_cards:log', correct: 'orderfly.stamp_cards:correct',
} as const;
const MEMBER_LIMIT = 5000, EVENT_LIMIT = 5000, HISTORY_LIMIT = 500;
// The CSV export reads past the on-screen limit, up to a hard ceiling it reports.
export const MEMBER_EXPORT_LIMIT = 50_000;
const id = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);

async function readPolicy(db: Firestore): Promise<Policy | null> {
  const parsed = policySchema.safeParse((await db.collection('platformAdminControl').doc('access-v1').get()).data());
  return parsed.success ? parsed.data : null;
}

export type AdminBrand = { brandId: string; brandName: string; companyId: string; companyName: string };

// Brands where the actor holds the permission for the whole brand. Program
// settings, member lists and the log combine every location, so a
// location-limited grant does not reveal them.
export async function adminBrands(db: Firestore, actor: AdminActor, permission: string): Promise<AdminBrand[]> {
  const policy = await readPolicy(db);
  if (!policy) return [];
  const principalId = principalKey(actor.identity), result: AdminBrand[] = [];
  for (const company of policy.companies.filter(c => c.active)) {
    if (!authorize(policy, { principalId, companyId: company.id, locationIds: null, permission }).allowed) continue;
    const brands = await Promise.all(company.orderflyBrandIds.map(brandId => db.collection('brands').doc(brandId).get()));
    for (const brand of brands) if (brand.exists)
      result.push({ brandId: brand.id, brandName: String(brand.data()?.name || brand.id), companyId: company.id, companyName: company.name || company.id });
  }
  return result.sort((a, b) => a.brandName.localeCompare(b.brandName, 'da'));
}

async function requireBrand(db: Firestore, actor: AdminActor, brandId: string, permission: string) {
  const brand = (await adminBrands(db, actor, permission)).find(b => b.brandId === brandId);
  if (!brand) throw new LoyaltyError('forbidden', 403);
  return brand;
}

// Locations of a brand where the actor holds a location-checked permission.
async function permittedLocations(db: Firestore, actor: AdminActor, brandId: string, permission: string) {
  const policy = await readPolicy(db);
  const company = policy?.companies.find(c => c.active && c.orderflyBrandIds.includes(brandId));
  if (!policy || !company) return [];
  const principalId = principalKey(actor.identity);
  const rows = await db.collection('locations').where('brandId', '==', brandId).get();
  return rows.docs.filter(doc => doc.data().isActive !== false && authorize(policy, { principalId, companyId: company.id, locationIds: [doc.id], permission }).allowed)
    .map(doc => ({ id: doc.id, name: String(doc.data().name || doc.id) }));
}

// ---------- Settings ----------

export async function readSettings(db: Firestore, actor: AdminActor, brandId: string) {
  const brand = await requireBrand(db, actor, brandId, ADMIN_PERMISSION.settings);
  const [programSnap, products, categories] = await Promise.all([
    db.collection(COLLECTIONS.programs).doc(brandId).get(),
    db.collection('products').where('brandId', '==', brandId).get(),
    db.collection('categories').where('brandId', '==', brandId).get(),
  ]);
  const data = programSnap.data();
  const program = readProgram(brandId, data);
  return {
    brand, version: program.version,
    settings: program.version === 0 ? { ...program.settings, name: `${brand.brandName} Club`.slice(0, 80) } : program.settings,
    updatedAt: typeof data?.updatedAt === 'number' ? data.updatedAt : null, updatedByName: typeof data?.updatedByName === 'string' ? data.updatedByName : null,
    // Only active products and categories can be promised as a reward.
    products: products.docs.filter(d => d.data().isActive !== false).map(d => ({ id: d.id, name: String(d.data().productName || d.id) })).sort((a, b) => a.name.localeCompare(b.name, 'da')),
    categories: categories.docs.filter(d => d.data().isActive !== false).map(d => ({ id: d.id, name: String(d.data().categoryName || d.id) })).sort((a, b) => a.name.localeCompare(b.name, 'da')),
  };
}

export const saveSettingsSchema = z.object({ brandId: id, version: z.number().int().min(0), settings: programSettingsSchema }).strict();

function settingsChanges(before: ProgramSettings | null, after: ProgramSettings) {
  return (Object.keys(after) as Array<keyof ProgramSettings>)
    .filter(key => JSON.stringify(before?.[key] ?? null) !== JSON.stringify(after[key]))
    .map(key => ({ field: key, from: before ? before[key] ?? null : null, to: after[key] }));
}

// Saves a new program version. Earlier cards and rewards keep the rules they
// were issued under. Every change is logged with employee, time, old and new value.
export async function saveSettings(db: Firestore, actor: AdminActor, input: z.infer<typeof saveSettingsSchema>, now: number) {
  const { brandId, settings } = input;
  return db.runTransaction(async tx => {
    await authorizeTransaction(tx, actor.identity, { brandId }, ADMIN_PERMISSION.settings, 'company');
    const policy = policySchema.parse((await tx.get(db.collection('platformAdminControl').doc('access-v1'))).data());
    const companyId = policy.companies.find(c => c.orderflyBrandIds.includes(brandId))!.id;
    const ref = db.collection(COLLECTIONS.programs).doc(brandId), saved = (await tx.get(ref)).data();
    const current = readProgram(brandId, saved);
    if (input.version !== current.version) throw new LoyaltyError('record_changed', 409);
    // Switching off must always be possible, even when the unchanged reward points at a retired product.
    const rewardUnchanged = JSON.stringify(settings.reward) === JSON.stringify(current.settings.reward);
    if (settings.reward?.type === 'free_product' && (settings.active || !rewardUnchanged)) {
      const refs = [...settings.reward.productIds.map(p => db.collection('products').doc(p)), ...settings.reward.categoryIds.map(c => db.collection('categories').doc(c))];
      const rows = await Promise.all(refs.map(r => tx.get(r)));
      if (rows.some(row => !row.exists || row.data()?.brandId !== brandId || row.data()?.isActive === false)) throw new LoyaltyError('invalid_reward_reference', 422);
    }
    const changes = settingsChanges(current.version === 0 ? null : current.settings, settings);
    if (!changes.length) return { version: current.version, changed: 0 };
    const version = current.version + 1;
    tx.set(ref, { brandId, version, settings, updatedAt: now, updatedBy: principalKey(actor.identity), updatedByName: actor.name });
    tx.create(db.collection('loyaltyProgramVersions').doc(`${brandId}_${version}`), { brandId, version, settings, createdAt: now, createdBy: principalKey(actor.identity), createdByName: actor.name });
    const event: LoyaltyEvent = { companyId, brandId, memberId: null, type: 'settings_changed', quantity: changes.length, amountOre: null, channel: null,
      source: 'admin', locationId: null, actorId: principalKey(actor.identity), actorName: actor.name, reason: null, idempotencyKey: null,
      requestHash: null, cardId: null, rewardId: null, createdAt: now, result: { version, changes } };
    tx.create(db.collection(COLLECTIONS.events).doc(hashKey('settings', brandId, String(version))), event);
    return { version, changed: changes.length };
  });
}

// ---------- Programs ----------

export type ProgramRow = { brandId: string; brandName: string; companyName: string; name: string; active: boolean; version: number;
  updatedAt: number | null; updatedByName: string | null; members: number };

// Stamp cards that have been created (saved at least once) for the given
// brands. A brand without a saved program is offered under "Opret" instead.
export async function listPrograms(db: Firestore, actor: AdminActor, brandIds: string[]): Promise<ProgramRow[]> {
  const brands = (await adminBrands(db, actor, ADMIN_PERMISSION.settings)).filter(b => brandIds.includes(b.brandId));
  if (!brands.length) return [];
  const docs = await db.getAll(...brands.map(b => db.collection(COLLECTIONS.programs).doc(b.brandId)));
  const rows = await Promise.all(brands.map(async (brand, i) => {
    const data = docs[i].data(), program = readProgram(brand.brandId, data);
    if (program.version === 0) return null;
    const members = await db.collection(COLLECTIONS.members).where('brandId', '==', brand.brandId).where('status', '==', 'active').count().get();
    return { brandId: brand.brandId, brandName: brand.brandName, companyName: brand.companyName, name: program.settings.name, active: program.settings.active,
      version: program.version, updatedAt: typeof data?.updatedAt === 'number' ? data.updatedAt : null,
      updatedByName: typeof data?.updatedByName === 'string' ? data.updatedByName : null, members: members.data().count };
  }));
  return rows.filter((row): row is ProgramRow => row !== null);
}

export const setProgramActiveSchema = z.object({ brandId: id, version: z.number().int().min(1), active: z.boolean() }).strict();

// Switches a created program on or off as a new settings version, with the
// same validation, version check and log entry as saving the settings form.
export async function setProgramActive(db: Firestore, actor: AdminActor, input: z.infer<typeof setProgramActiveSchema>, now: number) {
  await requireBrand(db, actor, input.brandId, ADMIN_PERMISSION.settings);
  const program = readProgram(input.brandId, (await db.collection(COLLECTIONS.programs).doc(input.brandId).get()).data());
  if (program.version === 0) throw new LoyaltyError('program_missing', 404);
  if (program.version !== input.version) throw new LoyaltyError('record_changed', 409);
  const parsed = saveSettingsSchema.safeParse({ brandId: input.brandId, version: input.version, settings: { ...program.settings, active: input.active } });
  if (!parsed.success) throw new LoyaltyError('settings_incomplete', 422);
  return saveSettings(db, actor, parsed.data, now);
}

// ---------- Members ----------

export type MemberRow = { id: string; brandId: string; brandName: string; name: string; email: string; joinedAt: number; stamps: number; stampsRequired: number;
  rewards: number; nextExpiry: number | null; newsletter: boolean; lastActivityAt: number | null };

export async function listMembers(db: Firestore, actor: AdminActor, brandIds: string[], now: number, limit = MEMBER_LIMIT) {
  const permitted = (await adminBrands(db, actor, ADMIN_PERMISSION.members)).filter(b => brandIds.includes(b.brandId));
  const rows: MemberRow[] = [];
  let truncated = false;
  for (const brand of permitted) {
    const [members, rewards, program] = await Promise.all([
      db.collection(COLLECTIONS.members).where('brandId', '==', brand.brandId).where('status', '==', 'active').limit(limit + 1).get(),
      db.collection(COLLECTIONS.rewards).where('brandId', '==', brand.brandId).where('status', '==', 'available').get(),
      db.collection(COLLECTIONS.programs).doc(brand.brandId).get().then(s => readProgram(brand.brandId, s.data())),
    ]);
    if (members.docs.length > limit) truncated = true;
    const docs = members.docs.slice(0, limit);
    const cardIds = docs.map(d => (d.data() as MemberDoc).currentCardId).filter((v): v is string => !!v);
    const cards = new Map<string, CardDoc>();
    for (let i = 0; i < cardIds.length; i += 100) {
      const batch = await db.getAll(...cardIds.slice(i, i + 100).map(c => db.collection(COLLECTIONS.cards).doc(c)));
      for (const card of batch) if (card.exists) cards.set(card.id, card.data() as CardDoc);
    }
    const rewardsByMember = new Map<string, number[]>();
    for (const doc of rewards.docs) {
      const reward = doc.data() as RewardDoc;
      if (reward.expiresAt > now) rewardsByMember.set(reward.memberId, [...(rewardsByMember.get(reward.memberId) || []), reward.expiresAt]);
    }
    for (const doc of docs) {
      const member = doc.data() as MemberDoc, card = member.currentCardId ? cards.get(member.currentCardId) : undefined;
      const live = card && card.memberId === doc.id && card.status === 'active' && !cardIsExpired(card, now) ? card : null;
      const expiries = [...(rewardsByMember.get(doc.id) || []), ...(live?.expiresAt ? [live.expiresAt] : [])];
      rows.push({ id: doc.id, brandId: brand.brandId, brandName: brand.brandName, name: member.name, email: member.normalizedEmail, joinedAt: member.joinedAt,
        stamps: live?.stamps ?? 0, stampsRequired: live?.stampsRequired ?? program.settings.stampsRequired, rewards: rewardsByMember.get(doc.id)?.length ?? 0,
        nextExpiry: expiries.length ? Math.min(...expiries) : null, newsletter: member.consent?.status === 'given', lastActivityAt: member.lastActivityAt ?? null });
    }
  }
  return { rows: rows.sort((a, b) => b.joinedAt - a.joinedAt), truncated };
}

export async function memberDetail(db: Firestore, actor: AdminActor, memberId: string, now: number) {
  if (!id.safeParse(memberId).success) throw new LoyaltyError('member_not_found', 404);
  const member = (await db.collection(COLLECTIONS.members).doc(memberId).get()).data() as MemberDoc | undefined;
  if (!member || member.status !== 'active') throw new LoyaltyError('member_not_found', 404);
  const brand = await requireBrand(db, actor, member.brandId, ADMIN_PERMISSION.members);
  const [cards, rewards, events, program, locations, correctLocations] = await Promise.all([
    db.collection(COLLECTIONS.cards).where('memberId', '==', memberId).get(),
    db.collection(COLLECTIONS.rewards).where('memberId', '==', memberId).get(),
    db.collection(COLLECTIONS.events).where('memberId', '==', memberId).orderBy('createdAt', 'desc').limit(HISTORY_LIMIT + 1).get(),
    db.collection(COLLECTIONS.programs).doc(member.brandId).get().then(s => readProgram(member.brandId, s.data())),
    db.collection('locations').where('brandId', '==', member.brandId).get(),
    permittedLocations(db, actor, member.brandId, ADMIN_PERMISSION.correct),
  ]);
  const locationName = new Map(locations.docs.map(d => [d.id, String(d.data().name || d.id)]));
  const card = member.currentCardId ? cards.docs.find(d => d.id === member.currentCardId)?.data() as CardDoc | undefined : undefined;
  const live = card && card.brandId === member.brandId && card.status === 'active' && !cardIsExpired(card, now) ? card : null;
  return {
    brand,
    member: { id: memberId, name: member.name, email: member.normalizedEmail, joinedAt: member.joinedAt, customerId: member.customerId,
      consent: member.consent, termsVersion: member.termsVersion, lastActivityAt: member.lastActivityAt ?? null },
    card: { stamps: live?.stamps ?? 0, stampsRequired: live?.stampsRequired ?? program.settings.stampsRequired, expiresAt: live?.expiresAt ?? null,
      locationName: live?.locationId ? locationName.get(live.locationId) ?? null : null },
    rewards: rewards.docs.map(d => ({ id: d.id, ...(d.data() as RewardDoc) })).filter(r => r.brandId === member.brandId)
      .sort((a, b) => b.earnedAt - a.earnedAt)
      .map(r => ({ id: r.id, description: r.description, earnedAt: r.earnedAt, expiresAt: r.expiresAt, status: r.status === 'available' && r.expiresAt <= now ? 'expired' : r.status,
        redeemedAt: r.redeemedAt, redeemedByName: r.redeemedByName, redeemedLocationName: r.redeemedLocationId ? locationName.get(r.redeemedLocationId) ?? null : null })),
    events: events.docs.slice(0, HISTORY_LIMIT).map(d => d.data() as LoyaltyEvent).filter(e => e.brandId === member.brandId).map(e => eventRow(e, locationName, member.name)),
    eventsTruncated: events.docs.length > HISTORY_LIMIT,
    correctLocations,
  };
}

// ---------- Log ----------

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const logFilterSchema = z.object({
  brandIds: z.array(id).min(1).max(50), from: day, to: day,
  type: z.enum(EVENT_TYPES).nullable(), actorId: z.string().regex(/^[a-f0-9]{64}$/).nullable(), channel: z.string().max(20).nullable(),
}).strict();

// Midnight in Copenhagen for a calendar day, as epoch milliseconds.
export function copenhagenMidnight(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  for (const offset of [1, 2]) {
    const candidate = Date.UTC(y, m - 1, d) - offset * 3_600_000;
    const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Copenhagen', hour: '2-digit', hourCycle: 'h23' }).format(new Date(candidate)));
    if (hour === 0) return candidate;
  }
  return Date.UTC(y, m - 1, d);
}

export type EventRow = { createdAt: number; type: string; memberId: string | null; memberName: string; quantity: number; amountOre: number | null;
  channel: string | null; source: string; locationName: string | null; actorId: string | null; actorName: string | null; reason: string | null;
  // Old and new value of each changed setting.
  details: string | null };

const show = (value: unknown) => value === null || value === undefined ? '—' : typeof value === 'object' ? JSON.stringify(value) : String(value);
function settingsDetails(e: LoyaltyEvent) {
  const changes = (e.result as { changes?: Array<{ field: string; from: unknown; to: unknown }> } | undefined)?.changes;
  return Array.isArray(changes) ? changes.map(c => `${c.field}: ${show(c.from)} → ${show(c.to)}`).join('; ') : null;
}

function eventRow(e: LoyaltyEvent, locationName: Map<string, string>, memberName: string): EventRow {
  return { createdAt: e.createdAt, type: e.type, memberId: e.memberId, memberName, quantity: e.quantity, amountOre: e.amountOre, channel: e.channel,
    source: e.source, locationName: e.locationId ? locationName.get(e.locationId) ?? null : null, actorId: e.actorId, actorName: e.actorName,
    // Correction reasons are shown; internal codes such as text versions are not.
    reason: e.source === 'correction' ? e.reason : null, details: e.type === 'settings_changed' ? settingsDetails(e) : null };
}

// The type, employee and channel filters are part of the query, so the row limit
// applies to matching events only (composite indexes in loyalty-firestore-indexes.json).
function eventQuery(db: Firestore, brandId: string, filter: { type: string | null; actorId: string | null; channel: string | null }) {
  let query = db.collection(COLLECTIONS.events).where('brandId', '==', brandId);
  if (filter.type) query = query.where('type', '==', filter.type);
  if (filter.actorId) query = query.where('actorId', '==', filter.actorId);
  if (filter.channel) query = query.where('channel', '==', filter.channel);
  return query;
}

export async function listEvents(db: Firestore, actor: AdminActor, filter: z.infer<typeof logFilterSchema>) {
  const permitted = (await adminBrands(db, actor, ADMIN_PERMISSION.log)).filter(b => filter.brandIds.includes(b.brandId));
  const from = copenhagenMidnight(filter.from), to = copenhagenMidnight(new Date(Date.parse(filter.to + 'T12:00:00Z') + 86_400_000).toISOString().slice(0, 10));
  const rows: EventRow[] = [], actors = new Map<string, string>();
  let truncated = false;
  for (const brand of permitted) {
    const [events, locations] = await Promise.all([
      eventQuery(db, brand.brandId, filter).where('createdAt', '>=', from).where('createdAt', '<', to)
        .orderBy('createdAt', 'desc').limit(EVENT_LIMIT + 1).get(),
      db.collection('locations').where('brandId', '==', brand.brandId).get(),
    ]);
    if (events.docs.length > EVENT_LIMIT) truncated = true;
    const locationName = new Map(locations.docs.map(d => [d.id, String(d.data().name || d.id)]));
    const list = events.docs.slice(0, EVENT_LIMIT).map(d => d.data() as LoyaltyEvent);
    for (const e of list) if (e.actorId && e.actorName) actors.set(e.actorId, e.actorName);
    const memberIds = [...new Set(list.map(e => e.memberId).filter((v): v is string => !!v))];
    const names = new Map<string, string>();
    for (let i = 0; i < memberIds.length; i += 100) {
      const batch = await db.getAll(...memberIds.slice(i, i + 100).map(m => db.collection(COLLECTIONS.members).doc(m)));
      for (const doc of batch) names.set(doc.id, doc.data()?.status === 'active' ? String(doc.data()?.name || '') : 'Slettet medlem');
    }
    for (const e of list) rows.push(eventRow(e, locationName, e.memberId ? names.get(e.memberId) ?? '' : ''));
  }
  return { rows: rows.sort((a, b) => b.createdAt - a.createdAt), actors: [...actors].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, 'da')), truncated };
}

// ---------- Overview ----------

export const overviewFilterSchema = z.object({
  brandIds: z.array(id).min(1).max(50), from: day, to: day, channel: z.enum(['dine_in', 'takeaway']).nullable(),
}).strict();
const OVERVIEW_EVENT_LIMIT = 20_000;
const OVERVIEW_MAX_DAYS = 366;
const COUNTER_SOURCES = new Set(['counter_qr', 'counter_search', 'order']);

// Every figure follows the filters. The channel filter applies to stamps, the
// only events with a sales channel; redemptions and rewards are counted for the brand.
export async function loyaltyOverview(db: Firestore, actor: AdminActor, filter: z.infer<typeof overviewFilterSchema>, now: number) {
  const permitted = (await adminBrands(db, actor, 'orderfly.stamp_cards:overview')).filter(b => filter.brandIds.includes(b.brandId));
  const shift = (day: string, n: number) => new Date(Date.parse(day + 'T12:00:00Z') + n * 86_400_000).toISOString().slice(0, 10);
  // Longer custom periods are shortened to the last 366 days, so every counted event has a daily bucket.
  const firstDay = filter.from < shift(filter.to, -(OVERVIEW_MAX_DAYS - 1)) ? shift(filter.to, -(OVERVIEW_MAX_DAYS - 1)) : filter.from;
  const from = copenhagenMidnight(firstDay), to = copenhagenMidnight(shift(filter.to, 1));
  const days: string[] = [];
  for (let d = firstDay; d <= filter.to; d = shift(d, 1)) days.push(d);
  const daily = new Map(days.map(d => [d, { day: d, stamps: 0, redemptions: 0 }]));
  const channels = { dine_in: 0, takeaway: 0 };
  const staff = new Map<string, { name: string; stamps: number; redemptions: number }>();
  const kpi = { activeMembers: 0, newMembers: 0, stamps: 0, rewardsEarned: 0, rewardsRedeemed: 0, rewardsOpen: 0, cardsExpiringSoon: 0, newsletterMembers: 0 };
  const programs: Array<{ brandId: string; brandName: string; name: string; active: boolean }> = [];
  const latest: Array<EventRow & { brandName: string }> = [];
  let truncated = false;
  const dayOf = (at: number) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Copenhagen', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(at));

  for (const brand of permitted) {
    const [program, members, events, recent, rewards, expiring, locations] = await Promise.all([
      db.collection(COLLECTIONS.programs).doc(brand.brandId).get().then(s => readProgram(brand.brandId, s.data())),
      db.collection(COLLECTIONS.members).where('brandId', '==', brand.brandId).where('status', '==', 'active').get(),
      db.collection(COLLECTIONS.events).where('brandId', '==', brand.brandId).where('createdAt', '>=', from).where('createdAt', '<', to)
        .orderBy('createdAt', 'desc').limit(OVERVIEW_EVENT_LIMIT + 1).get(),
      db.collection(COLLECTIONS.events).where('brandId', '==', brand.brandId).orderBy('createdAt', 'desc').limit(20).get(),
      db.collection(COLLECTIONS.rewards).where('brandId', '==', brand.brandId).where('status', '==', 'available').get(),
      db.collection(COLLECTIONS.cards).where('brandId', '==', brand.brandId).where('status', '==', 'active')
        .where('expiresAt', '>', now).where('expiresAt', '<=', now + 30 * 86_400_000).get(),
      db.collection('locations').where('brandId', '==', brand.brandId).get(),
    ]);
    programs.push({ brandId: brand.brandId, brandName: brand.brandName, name: program.settings.name, active: program.settings.active });
    for (const doc of members.docs) {
      const member = doc.data() as MemberDoc;
      kpi.activeMembers++;
      if (member.joinedAt >= from && member.joinedAt < to) kpi.newMembers++;
      if (member.consent?.status === 'given') kpi.newsletterMembers++;
    }
    kpi.rewardsOpen += rewards.docs.filter(d => (d.data() as RewardDoc).expiresAt > now).length;
    kpi.cardsExpiringSoon += expiring.docs.length;
    if (events.docs.length > OVERVIEW_EVENT_LIMIT) truncated = true;
    for (const doc of events.docs.slice(0, OVERVIEW_EVENT_LIMIT)) {
      const e = doc.data() as LoyaltyEvent, bucket = daily.get(dayOf(e.createdAt));
      const person = () => { const key = e.actorId!; if (!staff.has(key)) staff.set(key, { name: e.actorName || 'Ukendt', stamps: 0, redemptions: 0 }); return staff.get(key)!; };
      if (e.type === 'stamp_added' && COUNTER_SOURCES.has(e.source) && (!filter.channel || e.channel === filter.channel)) {
        kpi.stamps += e.quantity;
        if (bucket) bucket.stamps += e.quantity;
        if (e.channel === 'dine_in' || e.channel === 'takeaway') channels[e.channel] += e.quantity;
        if (e.actorId) person().stamps += e.quantity;
      } else if (e.type === 'reward_earned') kpi.rewardsEarned++;
      else if (e.type === 'reward_redeemed') {
        kpi.rewardsRedeemed++;
        if (bucket) bucket.redemptions++;
        if (e.actorId) person().redemptions++;
      }
    }
    const locationName = new Map(locations.docs.map(d => [d.id, String(d.data().name || d.id)]));
    const memberIds = [...new Set(recent.docs.map(d => (d.data() as LoyaltyEvent).memberId).filter((v): v is string => !!v))];
    const names = new Map<string, string>();
    if (memberIds.length) for (const doc of await db.getAll(...memberIds.map(m => db.collection(COLLECTIONS.members).doc(m))))
      names.set(doc.id, doc.data()?.status === 'active' ? String(doc.data()?.name || '') : 'Slettet medlem');
    for (const doc of recent.docs) {
      const e = doc.data() as LoyaltyEvent;
      latest.push({ ...eventRow(e, locationName, e.memberId ? names.get(e.memberId) ?? '' : ''), brandName: brand.brandName });
    }
  }
  return {
    programs, kpi: { ...kpi, newsletterShare: kpi.activeMembers ? kpi.newsletterMembers / kpi.activeMembers : null },
    daily: [...daily.values()], channels, staff: [...staff.values()].sort((a, b) => b.stamps + b.redemptions - a.stamps - a.redemptions),
    latest: latest.sort((a, b) => b.createdAt - a.createdAt).slice(0, 20), truncated, periodFrom: firstDay, periodShortened: firstDay !== filter.from,
  };
}
