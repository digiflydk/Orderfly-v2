import { copenhagenLocal } from './dates';

export type DashboardCampaign = {
  brandId: string;
  status: 'live' | 'scheduled' | 'paused' | 'test' | 'draft' | 'ended';
  startsAt: string | null;
  endsAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

/** A campaign appears when its active window intersects the selected Copenhagen calendar days. */
export function campaignInDateRange(row: DashboardCampaign, from: string, to: string): boolean {
  if (!from && !to) return true;
  const start = row.startsAt || (['live', 'paused', 'ended'].includes(row.status) ? row.createdAt : null);
  if (!start) return false;
  const end = row.endsAt || (row.status === 'ended' ? row.updatedAt : null);
  const startLocal = copenhagenLocal(start);
  const endLocal = end ? copenhagenLocal(end) : null;
  return (!to || startLocal.slice(0, 10) <= to) && (!from || !endLocal || endLocal > `${from}T00:00`);
}
