import 'server-only';
import { getAdminDb } from '@/lib/firebase-admin';
import { asDate } from '@/lib/loyalty/model';
import { customerFeedbackHistory } from '@/lib/feedback/customer-history';
import { contactKey } from '@/lib/marketing/store';
import { normalizeEmail } from '@/lib/integrations/esmeralda-customer-contract';
import type { Customer, OrderDetail } from '@/types';
import type { DirectoryEntry } from './directory';
import { newsletterStatus, topCustomerProducts, type CustomerOrderRow, type CustomerFeedbackRow, type CustomerGameRow, type NewsletterRow } from './history';

export async function customerHistory(entry: DirectoryEntry | undefined, customer: Customer, originalOrders: OrderDetail[], originalFeedback: NonNullable<Awaited<ReturnType<typeof customerFeedbackHistory>>>, feedbackAccess: boolean) {
  const db = getAdminDb();
  const sources = entry?.sources.filter(source => source.kind === 'customer') || [];
  const brandIds = [...new Set([...(entry?.brandIds || []), customer.brandId])];
  const emailsByBrand = new Map<string, Set<string>>();
  const addEmail = (brandId: string, value: string) => {
    const email = normalizeEmail(value);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return;
    const emails = emailsByBrand.get(brandId) || new Set<string>();
    emails.add(email);
    emailsByBrand.set(brandId, emails);
  };
  for (const source of entry?.sources || []) {
    for (const email of source.emails || [source.email]) addEmail(source.brandId, email);
  }
  addEmail(customer.brandId, customer.email);
  const extendedCustomer = customer as Customer & { emailAliases?: unknown; normalizedEmail?: unknown };
  if (Array.isArray(extendedCustomer.emailAliases)) {
    for (const email of extendedCustomer.emailAliases) if (typeof email === 'string') addEmail(customer.brandId, email);
  }
  const addressPairs = [...emailsByBrand.entries()].flatMap(([brandId, emails]) => [...emails].map(email => ({ brandId, email })));
  const optedInGames = entry?.sources.filter(source => source.kind === 'game' && source.newsletter) || [];
  const [brands, snapshots, feedback, contactSnapshots, gameJobs] = await Promise.all([
    Promise.all(brandIds.map(id => db.collection('brands').doc(id).get())),
    Promise.all(sources.map(source => db.collection('orders').where('brandId', '==', source.brandId).where('customerDetails.id', '==', source.id).get())),
    Promise.all(sources.map(source => source.id === customer.id && source.brandId === customer.brandId ? Promise.resolve(feedbackAccess ? originalFeedback : null) : customerFeedbackHistory(source.brandId, source.id))),
    Promise.all(addressPairs.map(({brandId, email}) => db.collection('marketingContacts').doc(contactKey(brandId, email)).get())),
    Promise.all(optedInGames.map(source => db.collection('gameConsentOutbox').doc(source.id).get())),
  ]);
  const names = new Map(brands.map(brand => [brand.id, String(brand.data()?.name || brand.id)]));
  const contactsByAddress = new Map(addressPairs.map((address, index) => [`${address.brandId}\n${address.email}`, contactSnapshots[index]]));
  const orders: OrderDetail[] = sources.length ? snapshots.flatMap((snapshot, index) => snapshot.docs.filter(doc => doc.data().brandId === sources[index].brandId && doc.data().customerDetails?.id === sources[index].id).map(doc => ({ ...doc.data(), id: doc.id, createdAt: asDate(doc.data().createdAt) || new Date(0), paidAt: asDate(doc.data().paidAt) || undefined } as OrderDetail))) : originalOrders;
  const feedbackIds = new Set(sources.length
    ? feedback.flatMap((rows, index) => rows?.flatMap(row => row.orderId ? [`${sources[index].brandId}:${row.orderId}`] : []) || [])
    : feedbackAccess ? originalFeedback.flatMap(row => row.orderId ? [`${customer.brandId}:${row.orderId}`] : []) : []);
  const orderRows: CustomerOrderRow[] = orders.map(order => ({ id: order.id, brandId: order.brandId, merchant: names.get(order.brandId) || order.brandId, date: asDate(order.paidAt)?.toISOString() || null, status: order.status, amount: Math.max(0, Number.isFinite(order.totalAmount) ? order.totalAmount - (order.refundedAmountOre || 0) / 100 : 0), feedback: feedbackIds.has(`${order.brandId}:${order.id}`) })).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const feedbackRows: CustomerFeedbackRow[] = feedback.flatMap((rows, index) => (rows || []).map(row => ({ id: row.id, brandId: sources[index].brandId, merchant: names.get(sources[index].brandId) || sources[index].brandId, date: row.receivedAt, rating: row.rating, comment: row.comment }))).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  if (!sources.length && feedbackAccess) feedbackRows.push(...originalFeedback.map(row => ({ id: row.id, brandId: customer.brandId, merchant: names.get(customer.brandId) || customer.brandId, date: row.receivedAt, rating: row.rating, comment: row.comment })));
  const games: CustomerGameRow[] = (entry?.sources.filter(source => source.kind === 'game') || []).map(source => ({ id: source.id, brandId: source.brandId, merchant: names.get(source.brandId) || source.brandId, campaign: source.campaignName || 'Scratch card', date: source.date, optedIn: source.newsletter === true, externalOrders: source.externalOrders || 0, externalSpend: source.externalSpend || 0 }));
  const gameStates = new Map<string, string[]>();
  gameJobs.forEach((doc, index) => {
    const data = doc.data(), source = optedInGames[index];
    if (!data || !doc.exists || data.brandId !== source.brandId || doc.id !== source.id) return;
    const states = [String(data.state || 'pending')];
    for (const email of source.emails || [source.email]) {
      const key = `${source.brandId}\n${normalizeEmail(email)}`;
      gameStates.set(key, [...(gameStates.get(key) || []), ...states]);
    }
  });
  const primaryEmail = normalizeEmail(typeof extendedCustomer.normalizedEmail === 'string' ? extendedCustomer.normalizedEmail : customer.email);
  const newsletters: NewsletterRow[] = brandIds.flatMap(brandId => {
    const emails = [...(emailsByBrand.get(brandId) || new Set<string>())];
    if (!emails.length) emails.push('');
    return emails.map(email => {
      const contact = email ? contactsByAddress.get(`${brandId}\n${email}`)?.data() : undefined;
      const state = newsletterStatus(
        contact?.brandId === brandId ? contact : undefined,
        brandId === customer.brandId && email === primaryEmail && customer.marketingConsent === true,
        gameStates.get(`${brandId}\n${email}`) || [],
      );
      return { brandId, merchant: names.get(brandId) || brandId, email, ...state };
    });
  });
  return { orders: orderRows, feedback: feedbackRows, feedbackAccess: feedback.some(rows => rows !== null) || feedbackAccess, games, newsletters, topProducts: topCustomerProducts(orders, names), merchants: brandIds.map(id => ({ id, name: names.get(id) || id })) };
}
