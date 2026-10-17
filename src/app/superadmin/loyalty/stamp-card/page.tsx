import Link from '@/components/superadmin/admin-link';
import { redirect } from 'next/navigation';
import { getAdminDb } from '@/lib/firebase-admin';
import { orderflySession } from '@/lib/access/orderfly-session';
import { AccessDeniedPage } from '@/components/superadmin/access-denied-page';
import { ADMIN_PERMISSION, adminBrands, listEvents, listMembers, readSettings } from '@/lib/loyalty/stamp-card/admin';
import { EVENT_TYPES } from '@/lib/loyalty/stamp-card/model';
import { filterQuery, parseFilters } from '@/lib/loyalty/stamp-card/filters';
import { LoyaltyFiltersBar } from '@/components/superadmin/loyalty/loyalty-filters';
import { SettingsForm } from './settings-form';
import { MembersTable } from './members-table';
import { EventLog } from './event-log';
import { cn } from '@/lib/utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TABS = [['settings', 'Indstillinger'], ['members', 'Medlemmer'], ['log', 'Log']] as const;
type Tab = typeof TABS[number][0];
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function StampCardPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await orderflySession().catch(() => null);
  if (!session) redirect('/admin-login');
  const db = getAdminDb(), actor = { identity: session.identity, name: session.name }, params = await searchParams, now = Date.now();
  // Each tab shows only brands where the user holds that tab's permission for the whole brand.
  const access = Object.fromEntries(await Promise.all(TABS.map(async ([tab]) => [tab, await adminBrands(db, actor, ADMIN_PERMISSION[tab])] as const)));
  const tabs = TABS.filter(([tab]) => access[tab].length);
  if (!tabs.length) return <AccessDeniedPage />;
  const requested = (Array.isArray(params.tab) ? params.tab[0] : params.tab) as Tab;
  const tab: Tab = tabs.some(([t]) => t === requested) ? requested : tabs[0][0];
  const brands = access[tab];
  const filters = parseFilters(params, now);
  const inCompany = brands.filter(b => !filters.company || b.companyId === filters.company);
  const selected = filters.brands.filter(id => inCompany.some(b => b.brandId === id));
  const brandIds = selected.length ? selected : inCompany.map(b => b.brandId);

  let body: React.ReactNode;
  if (tab === 'settings') {
    const brandId = brandIds[0];
    body = brandId ? <SettingsForm key={brandId} initial={await readSettings(db, actor, brandId)} /> : <p>Vælg et brand.</p>;
  } else if (tab === 'members') {
    const { rows, truncated } = await listMembers(db, actor, brandIds, now);
    body = <MembersTable rows={rows} truncated={truncated} brandIds={brandIds} filterQuery={filterQuery(filters)} multiBrand={brandIds.length > 1} />;
  } else {
    const type = (Array.isArray(params.type) ? params.type[0] : params.type) as typeof EVENT_TYPES[number] | undefined;
    const filter = { brandIds, from: filters.from, to: filters.to, type: type && (EVENT_TYPES as readonly string[]).includes(type) ? type : null, actorId: filters.actor, channel: filters.channel };
    const result = await listEvents(db, actor, filter);
    body = <EventLog rows={result.rows} truncated={result.truncated} filter={filter} multiBrand={brandIds.length > 1} />;
    return (
      <Shell tabs={tabs} tab={tab} query={filterQuery(filters)}>
        <LoyaltyFiltersBar filters={filters} brands={brands} actors={result.actors} extraParams={{ tab, ...(filter.type ? { type: filter.type } : {}) }} />
        {body}
      </Shell>
    );
  }
  return (
    <Shell tabs={tabs} tab={tab} query={filterQuery(filters)}>
      <LoyaltyFiltersBar filters={filters} brands={brands} showPeriod={false} showChannel={false} extraParams={{ tab }} />
      {body}
    </Shell>
  );
}

function Shell({ tabs, tab, query, children }: { tabs: ReadonlyArray<readonly [Tab, string]>; tab: Tab; query: string; children: React.ReactNode }) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Stempelkort</h1>
        <p className="text-muted-foreground">Indstillinger, medlemmer og log for loyalitetsprogrammet.</p>
      </div>
      <nav aria-label="Stempelkort" className="flex gap-1 border-b">
        {tabs.map(([key, label]) => (
          <Link key={key} href={`/superadmin/loyalty/stamp-card?${query}&tab=${key}`} aria-current={key === tab ? 'page' : undefined}
            className={cn('-mb-px border-b-2 px-4 py-2 text-sm font-medium', key === tab ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground')}>
            {label}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  );
}
