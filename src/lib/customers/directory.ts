import { createHash } from 'node:crypto';
import { format } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';
import { asDate } from '@/lib/loyalty/model';

export type DirectorySource = {
  id: string;
  brandId: string;
  name: string;
  email: string;
  emailAliases?: string[];
  phone?: string;
  phoneAliases?: string[];
  kind: 'customer' | 'game';
  createdAt?: unknown;
  totalOrders?: number;
  totalSpend?: number;
  lastOrderDate?: unknown;
  loyaltyClassification?: string;
  hasBookingSource?: boolean;
  hasOmnisendSource?: boolean;
  newsletter?: boolean;
  campaignId?: string;
  campaignName?: string;
  externalOrders?: number;
  externalSpend?: number;
};

export type DirectoryEntry = {
  id: string;
  name: string;
  email: string;
  emails: string[];
  phone: string;
  phones: string[];
  brandIds: string[];
  customerIds: string[];
  gameCount: number;
  totalOrders: number;
  totalSpend: number;
  lastOrderDate: string | null;
  sources: Array<{
    id: string;
    brandId: string;
    kind: 'customer' | 'game';
    name: string;
    email: string;
    emails: string[];
    phone: string;
    phones: string[];
    date: string | null;
    hasBookingSource?: boolean;
    hasOmnisendSource?: boolean;
    newsletter?: boolean;
    campaignId?: string;
    campaignName?: string;
    externalOrders?: number;
    externalSpend?: number;
    totalOrders?: number;
    totalSpend?: number;
    loyaltyClassification?: string;
  }>;
};

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function normalizePhone(value: string): string {
  const trimmed = value.trim();
  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return '';
  if (trimmed.startsWith('+')) return `+${digits}`;
  if (trimmed.startsWith('00')) return `+${digits.slice(2)}`;
  return digits;
}

function emailValues(source: DirectorySource): string[] {
  return [...new Set([source.email, ...(source.emailAliases || [])]
    .filter(value => typeof value === 'string')
    .map(normalizeEmail)
    .filter(value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)))];
}

function phoneValues(source: DirectorySource): string[] {
  return [...new Set([source.phone || '', ...(source.phoneAliases || [])]
    .filter(value => typeof value === 'string')
    .map(normalizePhone)
    .filter(Boolean))];
}

function copenhagenDate(value: unknown): string | null {
  const date = asDate(value);
  return date ? format(toZonedTime(date, 'Europe/Copenhagen'), 'yyyy-MM-dd') : null;
}

function displayValues(sources: DirectorySource[], field: 'email' | 'phone'): string[] {
  const values = sources.flatMap(source => field === 'email'
    ? [source.email, ...(source.emailAliases || [])]
    : [source.phone || '', ...(source.phoneAliases || [])]);
  const seen = new Set<string>();
  return values.map(value => value.trim()).filter(value => {
    const normalized = field === 'email' ? normalizeEmail(value) : normalizePhone(value);
    if (!normalized || seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

export function directoryKey(email: string, brandId?: string): string {
  const normalized = normalizeEmail(email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) return '';
  return createHash('sha256').update(`${brandId ? `${brandId}\n` : ''}${normalized}`).digest('hex');
}

function sourceOrder(a: DirectorySource, b: DirectorySource): number {
  return Number(b.kind === 'customer') - Number(a.kind === 'customer')
    || a.brandId.localeCompare(b.brandId)
    || a.id.localeCompare(b.id);
}

function groupId(sources: DirectorySource[], global: boolean): string {
  const ordered = [...sources].sort(sourceOrder);
  const primary = ordered.find(source => emailValues(source).length) || ordered.find(source => phoneValues(source).length);
  if (!primary) {
    const record = ordered[0];
    return createHash('sha256').update(`${global ? `${record.brandId}\n` : ''}record\n${record.brandId}\n${record.kind}\n${record.id}`).digest('hex');
  }
  const email = emailValues(primary)[0];
  const brandScope = global ? undefined : primary.brandId;
  if (email) return directoryKey(email, brandScope);
  const phone = phoneValues(primary)[0];
  return createHash('sha256').update(`${brandScope ? `${brandScope}\n` : ''}phone:${phone}`).digest('hex');
}

// Email or phone links source records within a brand. Superadmins can also
// inspect cross-brand candidate links, but source records and consent stay scoped.
export function buildDirectory(sources: DirectorySource[], global: boolean): DirectoryEntry[] {
  const parent = sources.map((_, index) => index);
  const find = (index: number): number => {
    if (parent[index] !== index) parent[index] = find(parent[index]);
    return parent[index];
  };
  const union = (left: number, right: number) => {
    const a = find(left), b = find(right);
    if (a !== b) parent[b] = a;
  };
  const owners = new Map<string, number>();
  sources.forEach((source, index) => {
    if (!source.brandId || !source.id || (!emailValues(source).length && !phoneValues(source).length)) return;
    const scope = global ? '*' : source.brandId;
    const tokens = [
      ...emailValues(source).map(value => `${scope}\nemail:${value}`),
      ...phoneValues(source).map(value => `${scope}\nphone:${value}`),
    ];
    for (const token of tokens) {
      const owner = owners.get(token);
      if (owner === undefined) owners.set(token, index);
      else union(index, owner);
    }
  });

  const groups = new Map<number, DirectorySource[]>();
  sources.forEach((source, index) => {
    if (!source.brandId || !source.id || (!emailValues(source).length && !phoneValues(source).length)) return;
    const root = find(index);
    const group = groups.get(root) || [];
    group.push(source);
    groups.set(root, group);
  });

  const entries: DirectoryEntry[] = [];
  for (const groupedSources of groups.values()) {
    const ordered = [...groupedSources].sort(sourceOrder);
    const contactSource = ordered.find(source => emailValues(source).length || phoneValues(source).length) || ordered[0];
    const emails = displayValues(ordered, 'email');
    const phones = displayValues(ordered, 'phone');
    const email = emailValues(contactSource)[0] || emails[0] || '';
    const phone = contactSource.phone?.trim() && phoneValues(contactSource).includes(normalizePhone(contactSource.phone))
      ? contactSource.phone.trim()
      : phones[0] || '';
    const id = groupId(ordered, global);
    const entry: DirectoryEntry = {
      id,
      name: contactSource.name || email || phone || 'Customer',
      email,
      emails,
      phone,
      phones,
      brandIds: [],
      customerIds: [],
      gameCount: 0,
      totalOrders: 0,
      totalSpend: 0,
      lastOrderDate: null,
      sources: [],
    };

    for (const source of groupedSources) {
      if (!entry.brandIds.includes(source.brandId)) entry.brandIds.push(source.brandId);
      // Keep directory filters on the same Copenhagen calendar day as the
      // customer-records view, including source timestamps close to midnight UTC.
      const sourceDate = copenhagenDate(source.createdAt);
      const sourceEmails = displayValues([source], 'email');
      const sourcePhones = displayValues([source], 'phone');
      if (source.kind === 'customer') {
        if (!entry.customerIds.includes(source.id)) entry.customerIds.push(source.id);
        if (source.name && !entry.name) entry.name = source.name;
        entry.totalOrders += Number.isFinite(source.totalOrders) ? source.totalOrders! : 0;
        entry.totalSpend += Number.isFinite(source.totalSpend) ? source.totalSpend! : 0;
        const last = asDate(source.lastOrderDate)?.toISOString() || null;
        if (last && (!entry.lastOrderDate || last > entry.lastOrderDate)) entry.lastOrderDate = last;
      } else {
        entry.gameCount++;
        entry.totalOrders += source.externalOrders || 0;
        entry.totalSpend += source.externalSpend || 0;
      }
      entry.sources.push({
        id: source.id,
        brandId: source.brandId,
        kind: source.kind,
        name: source.name,
        email: source.email || '',
        emails: sourceEmails,
        phone: source.phone || '',
        phones: sourcePhones,
        date: sourceDate,
        ...(source.kind === 'customer' ? {
          hasBookingSource: source.hasBookingSource === true,
          hasOmnisendSource: source.hasOmnisendSource === true,
          ...(source.loyaltyClassification ? { loyaltyClassification: source.loyaltyClassification } : {}),
          totalOrders: Number.isFinite(source.totalOrders) ? source.totalOrders : 0,
          totalSpend: Number.isFinite(source.totalSpend) ? source.totalSpend : 0,
        } : {
          newsletter: source.newsletter === true,
          campaignId: source.campaignId,
          campaignName: source.campaignName,
          externalOrders: source.externalOrders || 0,
          externalSpend: source.externalSpend || 0,
        }),
      });
    }
    entries.push(entry);
  }
  return entries.sort((a, b) => (b.lastOrderDate || '').localeCompare(a.lastOrderDate || '') || a.email.localeCompare(b.email) || a.phone.localeCompare(b.phone));
}
