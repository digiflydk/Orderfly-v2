import Link from '@/components/superadmin/admin-link';
import { redirect } from 'next/navigation';
import { getAdminDb } from '@/lib/firebase-admin';
import { orderflySession } from '@/lib/access/orderfly-session';
import { AccessDeniedPage } from '@/components/superadmin/access-denied-page';
import { ADMIN_PERMISSION, adminBrands, listEvents, listMembers, listPrograms, listTextVersions, readSettings, textVersionDetail } from '@/lib/loyalty/stamp-card/admin';
import { EVENT_TYPES } from '@/lib/loyalty/stamp-card/model';
import { filterQuery, parseFilters } from '@/lib/loyalty/stamp-card/filters';
import { LoyaltyFiltersBar } from '@/components/superadmin/loyalty/loyalty-filters';
import { SettingsForm } from './settings-form';
import { ProgramsOverview, type ProgramStatus } from './programs-overview';
import { MembersTable } from './members-table';
import { EventLog } from './event-log';
import { TextVersionDetail, TextVersions } from './text-versions';
import { cn } from '@/lib/utils';
import { readSignupNotifications } from '@/lib/loyalty/stamp-card/signup-notifications';
import { SignupNotificationCard } from './signup-notification-card';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TABS = [['settings', 'Oversigt'], ['members', 'Medlemmer'], ['log', 'Log'], ['texts', 'Tekstversioner']] as const;
type Tab = typeof TABS[number][0];
// Published texts belong to the program's settings and need the same permission.
const TAB_PERMISSION: Record<Tab, string> = { settings: ADMIN_PERMISSION.settings, members: ADMIN_PERMISSION.members, log: ADMIN_PERMISSION.log, texts: ADMIN_PERMISSION.settings };
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function StampCardPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await orderflySession().catch(() => null);
  if (!session) redirect('/admin-login');
  const db = getAdminDb(), actor = { identity: session.identity, name: session.name }, params = await searchParams, now = Date.now();
  // Each tab shows only brands where the user holds that tab's permission for the whole brand.
  const access = Object.fromEntries(await Promise.all(TABS.map(async ([tab]) => [tab, await adminBrands(db, actor, TAB_PERMISSION[tab])] as const)));
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
    // The overview lists created stamp cards; ?edit= opens one brand's settings, also to create it.
    const one = (key: string) => { const v = params[key]; return Array.isArray(v) ? v[0] : v; };
    const edit = brands.find(b => b.brandId === one('edit'));
    if (edit) {
      return (
        <Shell tabs={tabs} tab={tab} query={filterQuery(filters)}>
          <Link href={`/superadmin/loyalty/stamp-card?${filterQuery(filters, { tab: 'settings' })}`} className="text-sm text-muted-foreground hover:text-foreground">← Tilbage til oversigten</Link>
          <SettingsForm key={edit.brandId} initial={await readSettings(db, actor, edit.brandId)} canEditBrand={session.superuser} />
          {session.superuser && <SignupNotificationCard key={`notifications-${edit.brandId}`} brandId={edit.brandId} brandName={edit.brandName}
            initial={await readSignupNotifications(db, actor, edit.brandId)} />}
        </Shell>
      );
    }
    const programs = await listPrograms(db, actor, brands.map(b => b.brandId));
    const status = (['active', 'inactive'] as const).find(s => s === one('status')) ?? 'all';
    const created = new Set(programs.map(p => p.brandId));
    body = <ProgramsOverview rows={programs.filter(p => brandIds.includes(p.brandId))} status={status as ProgramStatus}
      editHref={`/superadmin/loyalty/stamp-card?${filterQuery(filters, { tab: 'settings' })}`}
      available={inCompany.filter(b => !created.has(b.brandId)).map(b => ({ brandId: b.brandId, brandName: b.brandName }))} />;
    return (
      <Shell tabs={tabs} tab={tab} query={filterQuery(filters)}>
        <LoyaltyFiltersBar filters={filters} brands={brands} showPeriod={false} showChannel={false} extraParams={{ tab, ...(status !== 'all' ? { status } : {}) }} />
        {body}
      </Shell>
    );
  } else if (tab === 'texts') {
    const one = (key: string) => { const v = params[key]; return Array.isArray(v) ? v[0] : v; };
    const back = `/superadmin/loyalty/stamp-card?${filterQuery(filters, { tab: 'texts' })}`;
    const viewBrand = brands.find(b => b.brandId === one('textBrand')), viewVersion = Number(one('textVersion'));
    if (viewBrand && Number.isSafeInteger(viewVersion)) {
      const detail = await textVersionDetail(db, actor, viewBrand.brandId, viewVersion).catch(() => null);
      return (
        <Shell tabs={tabs} tab={tab} query={filterQuery(filters)}>
          <Link href={back} className="text-sm text-muted-foreground hover:text-foreground">← Tilbage til tekstversionerne</Link>
          {detail ? <TextVersionDetail detail={detail} /> : <p className="text-muted-foreground">Versionen findes ikke.</p>}
        </Shell>
      );
    }
    body = <TextVersions rows={await listTextVersions(db, actor, brandIds)} viewHref={back} multiBrand={brandIds.length > 1} />;
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
        <p className="text-muted-foreground">Oversigt, medlemmer, log og tekstversioner for loyalitetsprogrammet.</p>
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
