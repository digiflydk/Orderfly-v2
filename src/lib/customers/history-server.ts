import 'server-only';
import { getAdminDb } from '@/lib/firebase-admin';
import { asDate } from '@/lib/loyalty/model';
import { customerFeedbackHistory } from '@/lib/feedback/customer-history';
import { contactKey } from '@/lib/marketing/store';
import type { Customer, OrderDetail } from '@/types';
import type { DirectoryEntry } from './directory';
import { newsletterStatus, topCustomerProducts, type CustomerOrderRow, type CustomerFeedbackRow, type CustomerGameRow, type NewsletterRow } from './history';

export async function customerHistory(entry: DirectoryEntry | undefined, customer: Customer, originalOrders: OrderDetail[], originalFeedback: NonNullable<Awaited<ReturnType<typeof customerFeedbackHistory>>>, feedbackAccess: boolean) {
  const db = getAdminDb();
  const sources = entry?.sources.filter(source => source.kind === 'customer') || [];
  const brandIds = entry?.brandIds || [customer.brandId];
  const [brands, snapshots, feedback, contacts, gameJobs] = await Promise.all([
    Promise.all(brandIds.map(id => db.collection('brands').doc(id).get())),
    Promise.all(sources.map(source => db.collection('orders').where('brandId', '==', source.brandId).where('customerDetails.id', '==', source.id).get())),
    Promise.all(sources.map(source => source.id === customer.id && source.brandId === customer.brandId ? Promise.resolve(feedbackAccess ? originalFeedback : null) : customerFeedbackHistory(source.brandId, source.id))),
    Promise.all(brandIds.map(id => db.collection('marketingContacts').doc(contactKey(id, customer.email)).get())),
    Promise.all((entry?.sources.filter(source => source.kind === 'game' && source.newsletter) || []).map(source => db.collection('gameConsentOutbox').doc(source.id).get())),
  ]);
  const names = new Map(brands.map(brand => [brand.id, String(brand.data()?.name || brand.id)]));
  const orders: OrderDetail[] = sources.length ? snapshots.flatMap((snapshot, index) => snapshot.docs.filter(doc => doc.data().brandId === sources[index].brandId && doc.data().customerDetails?.id === sources[index].id).map(doc => ({ ...doc.data(), id: doc.id, createdAt: asDate(doc.data().createdAt) || new Date(0) } as OrderDetail))) : originalOrders;
  const feedbackIds = new Set(feedback.flatMap((rows, index) => rows?.flatMap(row => row.orderId ? [`${sources[index].brandId}:${row.orderId}`] : []) || []));
  const orderRows: CustomerOrderRow[] = orders.map(order => ({ id: order.id, brandId: order.brandId, merchant: names.get(order.brandId) || order.brandId, date: asDate(order.createdAt)?.toISOString() || null, status: order.status, amount: Number.isFinite(order.totalAmount) ? order.totalAmount : 0, feedback: feedbackIds.has(`${order.brandId}:${order.id}`) })).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const feedbackRows: CustomerFeedbackRow[] = feedback.flatMap((rows, index) => (rows || []).map(row => ({ id: row.id, brandId: sources[index].brandId, merchant: names.get(sources[index].brandId) || sources[index].brandId, date: row.receivedAt, rating: row.rating, comment: row.comment }))).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  if (!sources.length && feedbackAccess) feedbackRows.push(...originalFeedback.map(row => ({ id: row.id, brandId: customer.brandId, merchant: names.get(customer.brandId) || customer.brandId, date: row.receivedAt, rating: row.rating, comment: row.comment })));
  const games: CustomerGameRow[] = (entry?.sources.filter(source => source.kind === 'game') || []).map(source => ({ id: source.id, brandId: source.brandId, merchant: names.get(source.brandId) || source.brandId, campaign: source.campaignName || 'Scratch card', date: source.date, optedIn: source.newsletter === true, externalOrders: source.externalOrders || 0, externalSpend: source.externalSpend || 0 }));
  const gameStates = new Map<string, string[]>();
  const optedInGames = entry?.sources.filter(source => source.kind === 'game' && source.newsletter) || [];
  gameJobs.forEach((doc, index) => { const data = doc.data(), source = optedInGames[index]; if (!data || !doc.exists || data.brandId !== source.brandId || doc.id !== source.id) return; const states = gameStates.get(data.brandId) || []; states.push(String(data.state || 'pending')); gameStates.set(data.brandId, states); });
  const newsletters: NewsletterRow[] = brandIds.map((brandId, index) => {
    const contact = contacts[index].data();
    const state = newsletterStatus(contact?.brandId === brandId ? contact : undefined, brandId === customer.brandId && customer.marketingConsent === true, gameStates.get(brandId) || []);
    return { brandId, merchant: names.get(brandId) || brandId, ...state };
  });
  return { orders: orderRows, feedback: feedbackRows, feedbackAccess: feedback.some(rows => rows !== null) || feedbackAccess, games, newsletters, topProducts: topCustomerProducts(orders, names), merchants: brandIds.map(id => ({ id, name: names.get(id) || id })) };
}
