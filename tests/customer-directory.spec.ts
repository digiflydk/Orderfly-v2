import { expect, test } from '@playwright/test';
import { buildDirectory, directoryKey } from '../src/lib/customers/directory';
import { formatDirectoryDate } from '../src/lib/customers/date-format';
import { matchesCustomerType, matchesDateRange } from '../src/lib/customers/filtering';

const sources = [
  {id:'a',brandId:'pizza',name:'Guest',email:' Guest@Example.com ',kind:'customer' as const,totalOrders:2,totalSpend:250,lastOrderDate:'2026-09-20'},
  {id:'b',brandId:'cafe',name:'Guest',email:'guest@example.com',kind:'customer' as const,totalOrders:1,totalSpend:90,lastOrderDate:'2026-09-21'},
  {id:'p',brandId:'cafe',name:'Guest',email:'guest@example.com',kind:'game' as const,newsletter:false,campaignId:'brunch',campaignName:'Brunch scratch card',externalOrders:1,externalSpend:120},
  {id:'t',brandId:'pizza',name:'Test',email:'test@example.com',kind:'game' as const,newsletter:true},
  {id:'ignored',brandId:'pizza',name:'Invalid',email:'invalid',kind:'game' as const},
];

test('superadmin sees one person, merchant links and total paid sales', () => {
  const rows=buildDirectory(sources,true);
  expect(rows).toHaveLength(2);
  const guest=rows.find(row=>row.email==='guest@example.com')!;
  expect(guest.id).toBe(directoryKey('guest@example.com'));
  expect(guest.brandIds).toEqual(['pizza','cafe']);
  expect([guest.totalOrders,guest.totalSpend,guest.gameCount]).toEqual([4,460,1]);
  expect(guest.sources.find(source=>source.kind==='game')?.newsletter).toBe(false);
  expect(guest.sources.find(source=>source.kind==='game')?.campaignName).toBe('Brunch scratch card');
  expect(guest.sources.find(source=>source.kind==='customer'&&source.brandId==='pizza')).toMatchObject({totalOrders:2,totalSpend:250});
  expect(guest).not.toHaveProperty('marketingConsent');
});

test('merchant identities remain brand scoped even with matching email', () => {
  const rows=buildDirectory(sources,false).filter(row=>row.email==='guest@example.com');
  expect(rows).toHaveLength(2);
  expect(rows.map(row=>row.brandIds)).toEqual([['cafe'],['pizza']]);
  expect(rows[0].id).not.toBe(rows[1].id);
  expect(rows.find(row=>row.brandIds[0]==='pizza')?.totalSpend).toBe(250);
  expect(rows.find(row=>row.brandIds[0]==='cafe')?.totalSpend).toBe(210);
  expect(rows.find(row=>row.brandIds[0]==='pizza')?.sources.some(source=>source.campaignName==='Brunch scratch card')).toBe(false);
});

test('booking, Omnisend and Games sources with different emails merge by the same brand phone', () => {
  const rows = buildDirectory([
    {id:'booking',brandId:'pizza',name:'Anna Jensen',email:'booking@example.com',phone:'+45 12 34 56 78',kind:'customer',hasBookingSource:true,totalOrders:0},
    {id:'omnisend',brandId:'pizza',name:'Anna',email:'newsletter@example.com',emailAliases:['booking@example.com'],phone:'0045 12 34 56 78',kind:'customer',hasOmnisendSource:true,totalOrders:0},
    {id:'game',brandId:'pizza',name:'Anna J',email:'games@example.com',phone:'+4512345678',kind:'game',newsletter:false},
  ], false);
  expect(rows).toHaveLength(1);
  expect(rows[0].customerIds).toEqual(['booking','omnisend']);
  expect(rows[0].brandIds).toEqual(['pizza']);
  expect(rows[0].emails).toEqual(expect.arrayContaining(['booking@example.com','newsletter@example.com','games@example.com']));
  expect(rows[0].phones).toEqual(['+45 12 34 56 78']);
  expect(rows[0].sources.filter(source=>source.kind==='customer').map(source=>source.hasBookingSource||source.hasOmnisendSource)).toEqual([true,true]);
  expect(matchesCustomerType('booking', rows[0].sources)).toBe(true);
  expect(matchesCustomerType('omnisend', rows[0].sources)).toBe(true);
});

test('phone-only directory identities stay brand scoped for merchants', () => {
  const sources = [
    {id:'a',brandId:'pizza',name:'Guest',email:'a@example.com',phone:'+45 12 34 56 78',kind:'customer' as const},
    {id:'b',brandId:'cafe',name:'Guest',email:'b@example.com',phone:'0045 12 34 56 78',kind:'customer' as const},
  ];
  expect(buildDirectory(sources,false)).toHaveLength(2);
  expect(buildDirectory(sources,true)).toHaveLength(1);
});

test('directory source dates use the same Copenhagen day as customer records', () => {
  const [entry] = buildDirectory([
    {id:'late-utc',brandId:'pizza',name:'Guest',email:'guest@example.com',kind:'customer',createdAt:'2026-01-01T23:30:00Z'},
  ], false);
  const sourceDate = entry.sources[0].date;

  expect(sourceDate).toBe('2026-01-02');
  expect(formatDirectoryDate(sourceDate)).toBe('2.1.2026');
  expect(matchesDateRange(sourceDate, '2026-01-02', '2026-01-02')).toBe(true);
  expect(matchesDateRange(sourceDate, '2026-01-01', '2026-01-01')).toBe(false);
});
