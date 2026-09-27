import { expect, test } from '@playwright/test';
import { buildDirectory, directoryKey } from '../src/lib/customers/directory';

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
