import { createHash } from 'node:crypto';
import { asDate } from '@/lib/loyalty/model';

export type DirectorySource = {
  id: string;
  brandId: string;
  name: string;
  email: string;
  phone?: string;
  kind: 'customer' | 'game';
  createdAt?: unknown;
  totalOrders?: number;
  totalSpend?: number;
  lastOrderDate?: unknown;
  newsletter?: boolean;
  campaignId?: string;
  externalOrders?: number;
  externalSpend?: number;
};

export type DirectoryEntry = {
  id: string;
  name: string;
  email: string;
  phone: string;
  brandIds: string[];
  customerIds: string[];
  gameCount: number;
  totalOrders: number;
  totalSpend: number;
  lastOrderDate: string | null;
  sources: Array<{id:string;brandId:string;kind:'customer'|'game';name:string;phone:string;date:string|null;newsletter?:boolean;campaignId?:string;externalOrders?:number;externalSpend?:number}>;
};

export function directoryKey(email: string, brandId?: string): string {
  const normalized = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) return '';
  return createHash('sha256').update(`${brandId ? `${brandId}\n` : ''}${normalized}`).digest('hex');
}

// The source records remain tenant-owned. Email is a candidate identity, not
// proof of ownership, and consent, address and notes are never merged.
export function buildDirectory(sources: DirectorySource[], global: boolean): DirectoryEntry[] {
  const entries = new Map<string, DirectoryEntry>();
  for (const source of sources) {
    const email = source.email?.trim().toLowerCase();
    const key = directoryKey(email, global ? undefined : source.brandId);
    if (!key || !source.brandId || !source.id) continue;
    let entry = entries.get(key);
    if (!entry) {
      entry = {id:key,name:source.name || email,email,phone:source.phone || '',brandIds:[],customerIds:[],gameCount:0,totalOrders:0,totalSpend:0,lastOrderDate:null,sources:[]};
      entries.set(key, entry);
    }
    if (!entry.brandIds.includes(source.brandId)) entry.brandIds.push(source.brandId);
    if (source.kind === 'customer') {
      entry.customerIds.push(source.id);
      entry.name = source.name || entry.name;
      entry.phone = source.phone || entry.phone;
      entry.totalOrders += Number.isFinite(source.totalOrders) ? source.totalOrders! : 0;
      entry.totalSpend += Number.isFinite(source.totalSpend) ? source.totalSpend! : 0;
      const last = asDate(source.lastOrderDate)?.toISOString() || null;
      if (last && (!entry.lastOrderDate || last > entry.lastOrderDate)) entry.lastOrderDate = last;
    } else {
      entry.gameCount++;
      entry.totalOrders += source.externalOrders || 0;
      entry.totalSpend += source.externalSpend || 0;
    }
    entry.sources.push({id:source.id,brandId:source.brandId,kind:source.kind,name:source.name,phone:source.phone || '',date:asDate(source.createdAt)?.toISOString() || null,...(source.kind==='game'?{newsletter:source.newsletter===true,campaignId:source.campaignId,externalOrders:source.externalOrders||0,externalSpend:source.externalSpend||0}: {})});
  }
  return [...entries.values()].sort((a,b)=>(b.lastOrderDate||'').localeCompare(a.lastOrderDate||'') || a.email.localeCompare(b.email));
}
