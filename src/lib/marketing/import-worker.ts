import 'server-only';

import { createHash, randomUUID } from 'node:crypto';
import type { DocumentReference, Firestore } from 'firebase-admin/firestore';

import { normalizeEmail, normalizePhone } from '@/lib/integrations/esmeralda-customer-contract';
import {
    customerHasEmail,
    customerHasPhone,
    mergeCustomerIdentity,
} from '@/lib/customer-identity';
import { configuredMarketingBrands, type MarketingConfig } from './config';
import { emailChannel, type ProviderContact } from './consent';
import { MarketingError, Omnisend } from './provider';

const NEVER = Number.MAX_SAFE_INTEGER;
const LEASE_MS = 60_000;
const CONTACTS_PER_PAGE = 25;
const SCHEDULED_IMPORT_BUDGET_MS = 25_000;
const MANUAL_IMPORT_BUDGET_MS = 40_000;
const IMPORT_RESPONSE_BUFFER_MS = 5_000;
const IMPORT_INTERVAL_MS = 5 * 60_000;
const WATERMARK_OVERLAP_MS = 5 * 60_000;

type ImportState = {
    backfillComplete?: boolean;
    after?: string | null;
    importedThrough?: string;
    lease?: string | null;
    leaseUntil?: number;
    nextAttemptAt?: number;
};

type CustomerRecord = Record<string, unknown> & {
    brandId?: unknown;
    email?: unknown;
    normalizedEmail?: unknown;
    fullName?: unknown;
    phone?: unknown;
    normalizedPhone?: unknown;
    emailAliases?: unknown;
    phoneAliases?: unknown;
    marketingConsent?: unknown;
    integrationSources?: unknown;
};

type CachedCustomer = {
    id: string;
    ref: DocumentReference;
    data: CustomerRecord;
};

type CustomerIndex = {
    byEmail: Map<string, CachedCustomer>;
    ambiguousEmails: Set<string>;
    byPhone: Map<string, CachedCustomer>;
    ambiguousPhones: Set<string>;
};

class ContactImportConflict extends Error {
    constructor(readonly code: string) {
        super(code);
        this.name = 'ContactImportConflict';
    }
}

function hash(value: string): string {
    return createHash('sha256').update(value, 'utf8').digest('hex');
}

function timestamp(value: unknown): number | null {
    if (typeof value !== 'string' && typeof value !== 'number' && !(value instanceof Date)) return null;
    const parsed = value instanceof Date ? value.getTime() : Date.parse(String(value));
    return Number.isFinite(parsed) ? parsed : null;
}

function isoTimestamp(value: unknown): string | null {
    const parsed = timestamp(value);
    return parsed === null ? null : new Date(parsed).toISOString();
}

function safeText(value: unknown, max: number): string {
    return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function isEmail(value: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isPlaceholderName(value: string): boolean {
    const name = value.trim().toLowerCase();
    return !name || name === 'ikke oplyst' || name === 'not provided';
}

function normalizedCustomerEmail(record: CustomerRecord): string {
    const primary = typeof record.normalizedEmail === 'string' ? record.normalizedEmail : record.email;
    return typeof primary === 'string' ? normalizeEmail(primary) : '';
}

async function loadCustomerIndex(
    db: Firestore,
    brandId: string,
    emails: string[],
    phones: string[],
    rawPhones: string[],
): Promise<CustomerIndex> {
    const index: CustomerIndex = {
        byEmail: new Map(),
        ambiguousEmails: new Set(),
        byPhone: new Map(),
        ambiguousPhones: new Set(),
    };
    const queries: Array<Promise<{ docs: Array<{ id: string; ref: DocumentReference; data(): Record<string, unknown> }> }>> = [];
    const customerCollection = db.collection('customers');
    if (emails.length) {
        queries.push(
            customerCollection.where('brandId', '==', brandId).where('normalizedEmail', 'in', emails).get(),
            customerCollection.where('brandId', '==', brandId).where('email', 'in', emails).get(),
            customerCollection.where('brandId', '==', brandId).where('emailAliases', 'array-contains-any', emails).get(),
        );
    }
    if (phones.length) {
        queries.push(
            customerCollection.where('brandId', '==', brandId).where('normalizedPhone', 'in', phones).get(),
            customerCollection.where('brandId', '==', brandId).where('phoneAliases', 'array-contains-any', phones).get(),
        );
    }
    const exactRawPhones = [...new Set(rawPhones.filter(Boolean))].slice(0, 25);
    if (exactRawPhones.length) {
        queries.push(
            customerCollection.where('brandId', '==', brandId).where('phone', 'in', exactRawPhones).get(),
        );
    }
    if (!queries.length) return index;

    const snapshots = await Promise.all(queries);
    const seen = new Set<string>();
    const add = (
        map: Map<string, CachedCustomer>,
        ambiguous: Set<string>,
        key: string,
        customer: CachedCustomer,
    ) => {
        const current = map.get(key);
        if (current && current.id !== customer.id) {
            map.delete(key);
            ambiguous.add(key);
        } else if (!ambiguous.has(key)) {
            map.set(key, customer);
        }
    };

    for (const snapshot of snapshots) {
        for (const doc of snapshot.docs) {
            if (seen.has(doc.id)) continue;
            seen.add(doc.id);
            const data = doc.data() as CustomerRecord;
            if (data.brandId !== brandId) continue;
            const customer = { id: doc.id, ref: doc.ref, data };
            for (const email of emails) {
                if (customerHasEmail(data, email)) add(index.byEmail, index.ambiguousEmails, email, customer);
            }
            for (const phone of phones) {
                if (customerHasPhone(data, phone)) add(index.byPhone, index.ambiguousPhones, phone, customer);
            }
        }
    }
    return index;
}

function providerIdentity(contact: ProviderContact) {
    const emailIdentifier = contact.identifiers?.find(identifier =>
        identifier.type === 'email' && isEmail(normalizeEmail(identifier.id))
    );
    if (!emailIdentifier) return null;
    const email = normalizeEmail(emailIdentifier.id);
    const channel = emailChannel(contact, email);
    const rawStatus = safeText(channel?.status, 40);
    const status = ['subscribed', 'unsubscribed', 'nonSubscribed'].includes(rawStatus)
        ? rawStatus
        : 'nonSubscribed';
    const consentSource = safeText(emailIdentifier.consent?.source, 128);
    const consentGrantedAt = isoTimestamp(emailIdentifier.consent?.createdAt);
    const consentEvidence = status === 'subscribed' && !!consentSource && !!consentGrantedAt;
    const providerStatusChangedAt = isoTimestamp(channel?.statusChangedAt);
    const providerUpdatedAt = isoTimestamp(contact.updatedAt);
    const providerCreatedAt = isoTimestamp(contact.createdAt);
    const phoneIdentifier = contact.identifiers?.find(identifier => identifier.type === 'phone');
    const phone = phoneIdentifier ? safeText(phoneIdentifier.id, 80) : '';
    const name = [safeText(contact.firstName, 100), safeText(contact.lastName, 100)]
        .filter(Boolean).join(' ').slice(0, 200);
    return {
        emailIdentifier,
        email,
        channel,
        status,
        consentSource,
        consentGrantedAt,
        consentEvidence,
        providerStatusChangedAt,
        providerUpdatedAt,
        providerCreatedAt,
        phone,
        normalizedPhone: normalizePhone(phone),
        name,
        providerContactId: safeText(contact.id || contact.contactID, 200) || null,
    };
}

async function recordConflict(
    db: Firestore,
    brandId: string,
    email: string,
    providerContactId: string | null,
    code: string,
    now: number,
): Promise<void> {
    const emailHash = hash(brandId + '\n' + email);
    const ref = db.collection('omnisendContactImportErrors').doc(hash(brandId + '\n' + emailHash + '\n' + code));
    await db.runTransaction(async tx => {
        const previous = await tx.get(ref);
        const data = previous.data() as Record<string, unknown> | undefined;
        tx.set(ref, {
            brandId,
            providerContactId,
            emailHash,
            code,
            attempts: Number(data?.attempts || 0) + 1,
            firstSeenAt: data?.firstSeenAt || now,
            updatedAt: now,
        }, { merge: true });
    });
}

async function importContact(
    db: Firestore,
    config: MarketingConfig,
    contact: ProviderContact,
    index: CustomerIndex,
    now: number,
): Promise<'created' | 'updated' | 'resolved' | 'skipped'> {
    const identity = providerIdentity(contact);
    if (!identity) return 'skipped';
    const {
        email, channel, status, consentSource,
        consentGrantedAt, consentEvidence, providerStatusChangedAt,
        providerUpdatedAt, providerCreatedAt, phone, normalizedPhone,
        name, providerContactId,
    } = identity;
    if (index.ambiguousEmails.has(email)) throw new ContactImportConflict('ambiguous_email_identity');
    if (normalizedPhone && index.ambiguousPhones.has(normalizedPhone))
        throw new ContactImportConflict('ambiguous_phone_identity');
    const emailMatch = index.byEmail.get(email) || null;
    const phoneMatch = normalizedPhone ? index.byPhone.get(normalizedPhone) || null : null;
    if (emailMatch && phoneMatch && emailMatch.id !== phoneMatch.id)
        throw new ContactImportConflict('customer_identity_conflict');
    const selected = emailMatch || phoneMatch;

    const emailHash = hash(config.brandId + '\n' + email);
    const identityRef = db.collection('integrationConsumerCustomerIdentities').doc(emailHash);
    const phoneHash = normalizedPhone ? hash(config.brandId + '\n' + normalizedPhone) : null;
    const phoneIdentityRef = phoneHash
        ? db.collection('integrationConsumerCustomerPhoneIdentities').doc(phoneHash)
        : null;
    const contactRef = db.collection('marketingContacts').doc(emailHash);
    const snapshotEventId = hash([
        config.brandId, emailHash, status, providerStatusChangedAt || '', providerUpdatedAt || '',
        consentSource, consentGrantedAt || '',
    ].join('\n'));
    const snapshotEventRef = db.collection('marketingConsentImports').doc(snapshotEventId);
    const deterministicCustomerId = 'cust-v2-' + emailHash.slice(0, 32);
    const deterministicRef = db.collection('customers').doc(deterministicCustomerId);
    const identityTime = now;
    let result: { id: string; data: CustomerRecord; created: boolean; updated: boolean; resolved: boolean };

    try {
        result = await db.runTransaction(async tx => {
            const [identitySnapshot, phoneIdentitySnapshot] = await Promise.all([
                tx.get(identityRef),
                phoneIdentityRef ? tx.get(phoneIdentityRef) : Promise.resolve(null),
            ]);
            const indexedIds = [identitySnapshot, phoneIdentitySnapshot]
                .filter(snapshot => !!snapshot?.exists)
                .map(snapshot => {
                    const indexedBrandId = snapshot!.get('brandId');
                    const indexedCustomerId = snapshot!.get('customerId');
                    if (indexedBrandId !== config.brandId || typeof indexedCustomerId !== 'string' || !indexedCustomerId)
                        throw new ContactImportConflict('identity_index_conflict');
                    return indexedCustomerId;
                });
            const uniqueIndexedIds = [...new Set(indexedIds)];
            if (uniqueIndexedIds.length > 1)
                throw new ContactImportConflict('customer_identity_conflict');
            const indexedCustomerId = uniqueIndexedIds[0] || null;
            if (selected && indexedCustomerId && selected.id !== indexedCustomerId)
                throw new ContactImportConflict('identity_index_conflict');

            let customerRef: DocumentReference;
            let customerSnapshot: FirebaseFirestore.DocumentSnapshot | null = null;
            let customerData: CustomerRecord = {};
            let created = false;

            if (indexedCustomerId) {
                customerRef = db.collection('customers').doc(indexedCustomerId);
                customerSnapshot = await tx.get(customerRef);
                if (!customerSnapshot.exists)
                    throw new ContactImportConflict('identity_index_conflict');
                customerData = customerSnapshot.data() as CustomerRecord;
            } else if (selected) {
                customerRef = selected.ref;
                customerSnapshot = await tx.get(customerRef);
                if (!customerSnapshot.exists)
                    throw new ContactImportConflict('identity_index_conflict');
                customerData = customerSnapshot.data() as CustomerRecord;
            } else {
                customerRef = deterministicRef;
                customerSnapshot = await tx.get(customerRef);
                if (customerSnapshot.exists) {
                    customerData = customerSnapshot.data() as CustomerRecord;
                } else {
                    created = true;
                }
            }

            if (!created) {
                if (
                    customerData.brandId !== config.brandId ||
                    (!customerHasEmail(customerData, email) && !customerHasPhone(customerData, normalizedPhone))
                ) {
                    throw new ContactImportConflict('identity_index_conflict');
                }
                if (identitySnapshot.exists && !customerHasEmail(customerData, email))
                    throw new ContactImportConflict('identity_index_conflict');
                if (phoneIdentitySnapshot?.exists && !customerHasPhone(customerData, normalizedPhone))
                    throw new ContactImportConflict('identity_index_conflict');
            }

            const stateSnapshot = await tx.get(contactRef);
            const state = stateSnapshot.data() as Record<string, unknown> | undefined;
            const latestEventId = typeof state?.latestEventId === 'string' ? state.latestEventId : null;
            const localEventSnapshot = latestEventId
                ? await tx.get(db.collection('marketingConsents').doc(latestEventId))
                : null;
            const localEvent = localEventSnapshot?.data() as Record<string, unknown> | undefined;
            const localEventMatches = localEvent?.brandId === config.brandId
                && localEvent?.customerId === customerRef.id;
            const outboxRef = latestEventId ? db.collection('marketingOutbox').doc(latestEventId) : null;
            const outboxSnapshot = outboxRef ? await tx.get(outboxRef) : null;
            const outbox = outboxSnapshot?.data() as Record<string, unknown> | undefined;
            const providerStatusTime = timestamp(providerStatusChangedAt) ?? timestamp(providerUpdatedAt);
            const localCapturedAt = typeof localEvent?.capturedAt === 'number' ? localEvent.capturedAt : null;
            const localPending = localEventMatches && ['pending', 'failed'].includes(String(outbox?.state || ''));
            const localConsentIsNewer = localEventMatches && (
                localPending || (localCapturedAt !== null && providerStatusTime !== null && localCapturedAt > providerStatusTime)
            );

            const currentName = typeof customerData.fullName === 'string' ? customerData.fullName.trim() : '';
            const profileUpdated = !created && (
                !customerHasEmail(customerData, email) ||
                !!(name && isPlaceholderName(currentName)) ||
                !!(normalizedPhone && !customerHasPhone(customerData, normalizedPhone))
            );
            const currentSources = customerData.integrationSources && typeof customerData.integrationSources === 'object'
                ? customerData.integrationSources as Record<string, unknown>
                : {};
            const previousOmnisendSource = currentSources.omnisend && typeof currentSources.omnisend === 'object'
                ? currentSources.omnisend as Record<string, unknown>
                : {};
            const sourceData = {
                ...previousOmnisendSource,
                ...(providerContactId ? { contactId: providerContactId } : {}),
                firstImportedAt: previousOmnisendSource.firstImportedAt || new Date(now),
                lastSyncedAt: new Date(now),
                ...(providerCreatedAt ? { providerCreatedAt: new Date(providerCreatedAt) } : {}),
                ...(providerUpdatedAt ? { providerUpdatedAt: new Date(providerUpdatedAt) } : {}),
            };
            const customerPatch: CustomerRecord = {
                ...mergeCustomerIdentity(customerData, email, phone),
                id: customerRef.id,
                brandId: config.brandId,
                integrationSources: { ...currentSources, omnisend: sourceData },
                ...(name && isPlaceholderName(currentName) ? { fullName: name } : {}),
            };
            const incomingStatusIsSubscribed = status === 'subscribed';
            const canApplyProviderState = !localConsentIsNewer;
            const currentPrimaryEmail = customerEmail(customerData);
            const consentMatchesPrimaryEmail = created || !currentPrimaryEmail || currentPrimaryEmail === email;
            let nextMarketingState = typeof state?.state === 'string' ? state.state : 'suppressed';
            let nextMarketingConsent: boolean | undefined;
            if (canApplyProviderState) {
                if (status === 'unsubscribed') {
                    nextMarketingState = 'suppressed';
                    if (consentMatchesPrimaryEmail) nextMarketingConsent = false;
                } else if (incomingStatusIsSubscribed && (
                    consentEvidence || (consentMatchesPrimaryEmail && customerData.marketingConsent === true)
                )) {
                    nextMarketingState = 'synced';
                    if (consentEvidence && consentMatchesPrimaryEmail) nextMarketingConsent = true;
                } else {
                    nextMarketingState = 'suppressed';
                    if (consentMatchesPrimaryEmail && customerData.marketingConsent !== true)
                        nextMarketingConsent = false;
                }
            }
            if (nextMarketingConsent !== undefined) customerPatch.marketingConsent = nextMarketingConsent;

            const emailHashForImportEvent = emailHash;
            const importEventData = {
                brandId: config.brandId,
                omnisendBrandId: config.omnisendBrandId,
                customerId: customerRef.id,
                providerContactId,
                emailHash: emailHashForImportEvent,
                providerStatus: status,
                providerStatusChangedAt: providerStatusChangedAt || null,
                providerUpdatedAt: providerUpdatedAt || null,
                consentSource: consentSource || null,
                consentCreatedAt: consentGrantedAt || null,
                consentEvidence,
                importedAt: now,
            };
            const existingSnapshotEvent = await tx.get(snapshotEventRef);

            if (created) {
                const createData: CustomerRecord = {
                    ...customerPatch,
                    fullName: name || email,
                    phone,
                    normalizedPhone,
                    status: 'active',
                    createdAt: new Date(providerCreatedAt ? Date.parse(providerCreatedAt) : now),
                    totalOrders: 0,
                    totalSpend: 0,
                    locationIds: [],
                    loyaltyScore: 0,
                    loyaltyClassification: 'New',
                    marketingConsent: nextMarketingConsent ?? false,
                };
                tx.set(customerRef, createData);
                customerData = createData;
            } else {
                const updatePatch = { ...customerPatch };
                delete updatePatch.id;
                delete updatePatch.brandId;
                tx.set(customerRef, updatePatch, { merge: true });
                customerData = { ...customerData, ...updatePatch };
            }

            tx.set(identityRef, {
                brandId: config.brandId,
                customerId: customerRef.id,
                emailHash,
                source: typeof identitySnapshot.get('source') === 'string' ? identitySnapshot.get('source') : 'omnisend',
                updatedAt: identityTime,
                ...(identitySnapshot.exists ? {} : { createdAt: identityTime }),
            }, { merge: true });
            if (phoneIdentityRef && phoneHash) {
                tx.set(phoneIdentityRef, {
                    brandId: config.brandId,
                    customerId: customerRef.id,
                    phoneHash,
                    source: 'omnisend',
                    updatedAt: identityTime,
                    ...(phoneIdentitySnapshot?.exists ? {} : { createdAt: identityTime }),
                }, { merge: true });
            }
            tx.set(contactRef, {
                brandId: config.brandId,
                customerId: customerRef.id,
                provider: 'omnisend',
                providerStatus: status,
                providerLastImportedAt: now,
                ...(providerStatusChangedAt ? { providerStatusChangedAt } : {}),
                ...(consentSource ? { providerConsentSource: consentSource } : {}),
                ...(consentGrantedAt ? { providerConsentCreatedAt: consentGrantedAt } : {}),
                state: nextMarketingState,
                ...(!latestEventId ? { nextReconcileAt: NEVER } : {}),
                updatedAt: now,
            }, { merge: true });
            if (!existingSnapshotEvent.exists) tx.create(snapshotEventRef, importEventData);
            if (canApplyProviderState && status === 'unsubscribed' && outboxRef && outboxSnapshot?.exists
                && ['pending', 'failed'].includes(String(outbox?.state || '')) && !outbox?.lease
                && outbox?.brandId === config.brandId && outbox?.customerId === customerRef.id) {
                tx.update(outboxRef, {
                    state: 'suppressed',
                    lastError: 'provider_unsubscribe',
                    nextAttemptAt: NEVER,
                    updatedAt: now,
                });
            }
            return {
                id: customerRef.id,
                data: customerData,
                created,
                updated: profileUpdated,
                resolved: !created,
            };
        });
    } catch (error) {
        if (error instanceof ContactImportConflict) throw error;
        throw error;
    }

    const cached = { id: result.id, ref: db.collection('customers').doc(result.id), data: result.data };
    index.ambiguousEmails.delete(email);
    index.byEmail.set(email, cached);
    if (normalizedPhone) {
        index.ambiguousPhones.delete(normalizedPhone);
        index.byPhone.set(normalizedPhone, cached);
    }
    return result.created ? 'created' : result.updated ? 'updated' : 'resolved';
}

function customerEmail(record: CustomerRecord): string {
    return typeof record.normalizedEmail === 'string'
        ? normalizeEmail(record.normalizedEmail)
        : typeof record.email === 'string' ? normalizeEmail(record.email) : '';
}

async function claimState(ref: DocumentReference, db: Firestore, now: number, allowEarly: boolean) {
    const lease = randomUUID();
    return db.runTransaction(async tx => {
        const snapshot = await tx.get(ref);
        const current = snapshot.data() as ImportState | undefined;
        if ((current?.leaseUntil || 0) > now || (!allowEarly && (current?.nextAttemptAt || 0) > now)) return null;
        tx.set(ref, {
            lease,
            leaseUntil: now + LEASE_MS,
            ...(snapshot.exists ? {} : { backfillComplete: false, after: null }),
            updatedAt: now,
        }, { merge: true });
        return { ...(current || { backfillComplete: false, after: null }), lease };
    });
}

async function releaseState(
    db: Firestore,
    ref: DocumentReference,
    lease: string,
    patch: Partial<ImportState> & Record<string, unknown>,
    now: number,
): Promise<void> {
    await db.runTransaction(async tx => {
        const snapshot = await tx.get(ref);
        if (snapshot.data()?.lease !== lease) return;
        tx.set(ref, { ...patch, lease: null, leaseUntil: 0, updatedAt: now }, { merge: true });
    });
}

function errorCode(error: unknown): string {
    return error instanceof MarketingError
        ? safeText(error.code, 100) || 'import_failed'
        : error instanceof ContactImportConflict
            ? error.code
            : 'import_failed';
}

export async function runOmnisendContactImportWorker(
    db: Firestore,
    now = Date.now(),
    makeProvider: (config: MarketingConfig) => Omnisend = config => new Omnisend(config),
    requestDeadline = Date.now() + 45_000,
    options: { brandId?: string; allowEarly?: boolean } = {},
) {
    const importBudget = options.allowEarly === true
        ? MANUAL_IMPORT_BUDGET_MS
        : SCHEDULED_IMPORT_BUDGET_MS;
    const deadline = Math.min(Date.now() + importBudget, requestDeadline - IMPORT_RESPONSE_BUFFER_MS);
    const counts = { brands: 0, pages: 0, imported: 0, created: 0, updated: 0, resolved: 0, skipped: 0, conflicts: 0, failed: 0, busy: 0 };
    const results: Array<{ brandId: string; status: 'imported' | 'busy' | 'failed'; backfillComplete?: boolean; hasMore?: boolean; imported?: number; error?: string }> = [];
    const configs = configuredMarketingBrands().filter(config => !options.brandId || config.brandId === options.brandId);
    for (const config of configs) {
        if (Date.now() >= deadline) break;
        const stateRef = db.collection('omnisendContactImportState').doc(config.brandId);
        const state = await claimState(stateRef, db, now, options.allowEarly === true);
        if (!state) {
            counts.busy++;
            results.push({ brandId: config.brandId, status: 'busy' });
            continue;
        }
        counts.brands++;
        try {
            const provider = makeProvider(config);
            await provider.verifyBrand();
            const backfillComplete = state.backfillComplete === true;
            const importedThroughTime = timestamp(state.importedThrough) ?? Math.max(0, now - WATERMARK_OVERLAP_MS);
            const updatedAtFrom = backfillComplete
                ? new Date(Math.max(0, importedThroughTime - WATERMARK_OVERLAP_MS)).toISOString()
                : undefined;
            const page = await provider.listContacts({
                after: state.after || undefined,
                updatedAtFrom,
                limit: CONTACTS_PER_PAGE,
            });
            const pageEmails = new Set<string>();
            const pagePhones = new Set<string>();
            const pageRawPhones = new Set<string>();
            for (const contact of page.contacts) {
                const identity = providerIdentity(contact);
                if (!identity) continue;
                pageEmails.add(identity.email);
                if (identity.normalizedPhone) pagePhones.add(identity.normalizedPhone);
                if (identity.phone) pageRawPhones.add(identity.phone);
            }
            const index = await loadCustomerIndex(
                db,
                config.brandId,
                [...pageEmails],
                [...pagePhones],
                [...pageRawPhones],
            );
            for (const contact of page.contacts) {
                if (Date.now() >= deadline) throw new MarketingError('import_deadline', true);
                try {
                    const result = await importContact(db, config, contact, index, now);
                    counts[result]++;
                    if (result !== 'skipped') counts.imported++;
                } catch (error) {
                    if (!(error instanceof ContactImportConflict)) throw error;
                    const identity = providerIdentity(contact);
                    if (identity) {
                        await recordConflict(db, config.brandId, identity.email, identity.providerContactId, error.code, now);
                        counts.conflicts++;
                    } else {
                        counts.skipped++;
                    }
                }
            }
            const complete = !page.after;
            const importedThrough = complete ? new Date(now).toISOString() : state.importedThrough;
            await releaseState(db, stateRef, state.lease, {
                after: page.after,
                backfillComplete: backfillComplete || complete,
                importedThrough,
                nextAttemptAt: now + (page.after ? 5_000 : IMPORT_INTERVAL_MS),
                lastError: null,
            }, now);
            counts.pages++;
            results.push({ brandId: config.brandId, status: 'imported', backfillComplete: backfillComplete || complete, hasMore: !!page.after, imported: counts.imported });
        } catch (error) {
            const code = errorCode(error);
            await releaseState(db, stateRef, state.lease, {
                nextAttemptAt: now + IMPORT_INTERVAL_MS,
                lastError: code,
            }, now);
            counts.failed++;
            results.push({ brandId: config.brandId, status: 'failed', error: code });
        }
    }
    return { ...counts, results };
}
