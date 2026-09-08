#!/usr/bin/env node
// Offline read-only report from an authorized JSON export of analytics_events.
// No network, credentials or production writes. Never prints customer/session IDs.
const fs = require('node:fs');
function summarize(rows, release) {
  const events = rows.filter(row => row.source === 'commerce-v1' && (!release || row.release === release));
  const verified = row => row.name === 'payment_succeeded' && row.verifiedPayment === true &&
    row.provenance === 'server-verified-payment-v1' && typeof row.id === 'string' && row.id.startsWith('commerce-');
  const groups = new Map();
  for (const row of events) {
    if (row.name !== 'web_vital' || !['LCP','INP','CLS'].includes(row.metricName) || !Number.isFinite(row.value)) continue;
    const key = [row.release || 'unknown', row.deviceType || 'unknown', row.pageType || 'unknown', row.metricName].join('/');
    if (!groups.has(key)) groups.set(key, new Map());
    groups.get(key).set(`${row.sessionId}/${row.metricId}`, row.value);
  }
  const vitals = [...groups].map(([group, samples]) => {
    const values = [...samples.values()].sort((a,b) => a-b), metric = group.split('/').at(-1);
    const target = {LCP:2500,INP:200,CLS:0.1}[metric];
    const p75 = values[Math.max(0, Math.ceil(values.length*0.75)-1)];
    return {group, samples: values.length, p75, target, meetsTarget:p75<=target};
  });
  const stages = ['view_menu','add_to_cart','start_checkout','payment_session_created','payment_succeeded'];
  const funnel = ['mobile','desktop','unknown'].map(device => {
    const scoped = events.filter(row => (row.deviceType || 'unknown') === device);
    const counts = Object.fromEntries(stages.map(stage => [stage, new Set(scoped.filter(row => row.name === stage && row.sessionId && (stage !== 'payment_succeeded' || verified(row))).map(row => row.sessionId)).size]));
    return {device, sessions: counts, verifiedOrders: new Set(scoped.filter(row => verified(row) && row.orderId).map(row => `${row.brandId}/${row.orderId}`)).size};
  });
  return {release:release || 'all', vitals, funnel, note:'Consented session counts, not guaranteed complete attribution. Verified orders include unlinked transactions. p75 needs representative traffic; do not infer improvement from small samples.'};
}
if (require.main === module) {
  const file=process.argv[2]; if (!file) throw new Error('Usage: node scripts/commerce-metrics-report.cjs export.json [release-sha]');
  const raw=JSON.parse(fs.readFileSync(file,'utf8'));
  process.stdout.write(JSON.stringify(summarize(Array.isArray(raw)?raw:raw.events||[],process.argv[3]),null,2)+'\n');
}
module.exports={summarize};
