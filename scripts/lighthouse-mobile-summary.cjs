const fs = require('node:fs');
const { menuImageKindFromRequest } = require('./lighthouse-image-url.cjs');

function median(nums) {
  const sorted = nums.slice().sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

const runs = [1, 2, 3].map(i => {
  const result = JSON.parse(fs.readFileSync(`reports/lighthouse-mobile-${i}.json`, 'utf8'));
  if (!result.categories?.performance || result.runtimeError) throw new Error(`Lighthouse run ${i} failed: ${result.runtimeError?.message}`);
  const audits = result.audits;
  const metric = name => audits[name]?.numericValue ?? null;
  const resources = audits['network-requests']?.details?.items ?? [];
  const bytes = f => resources.filter(f).reduce((sum, item) => sum + (Number(item.transferSize) || 0), 0);
  const isImage = item => item.resourceType === 'Image' || /\.(?:webp|avif|png|jpe?g|gif)(?:\?|$)/i.test(item.url || '');
  const kind = item => menuImageKindFromRequest(item.url || '');
  const menu = item => kind(item) !== null;
  const improperlySized = audits['uses-responsive-images'];
  return {
    run: i, score: Math.round(result.categories.performance.score * 100),
    fcpMs: metric('first-contentful-paint'), lcpMs: metric('largest-contentful-paint'),
    speedIndexMs: metric('speed-index'), tbtMs: metric('total-blocking-time'), cls: metric('cumulative-layout-shift'),
    totalBytes: metric('total-byte-weight'), imageBytes: bytes(isImage),
    menuImageBytes: bytes(menu), thumbnailCount: resources.filter(item => kind(item) === 'thumb').length,
    fullImageCount: resources.filter(item => kind(item) === 'full').length,
    responsiveImageSavingsBytes: improperlySized?.details?.overallSavingsBytes ?? null,
    finalUrl: result.finalDisplayedUrl || result.finalUrl,
    fetchTime: result.fetchTime,
  };
});
const fields = ['score','fcpMs','lcpMs','speedIndexMs','tbtMs','cls','totalBytes','imageBytes','menuImageBytes','thumbnailCount','fullImageCount','responsiveImageSavingsBytes'];
const medians = Object.fromEntries(fields.map(key => [key, runs.some(x => x[key] === null) ? null : median(runs.map(x => x[key]))]));
const result = {target:'https://esmeralda.orderfly.dk/amager', formFactor:'mobile', throttling:'simulate', runs, medians};
fs.writeFileSync('reports/summary.json',JSON.stringify(result,null,2));
const round = (v, d = 0) => v === null ? 'N/A' : Number(v).toFixed(d);
const lines = ['## Esmeralda V2, Lighthouse 12, mobile: 3 cold loads','','| Metric | Run 1 | Run 2 | Run 3 | Median |','|---|---:|---:|---:|---:|'];
for(const [label, key, digits] of [
 ['Performance score','score',0],['FCP (ms)','fcpMs',0],['LCP (ms)','lcpMs',0],['Speed Index (ms)','speedIndexMs',0],
 ['TBT (ms)','tbtMs',0],['CLS','cls',3],['Total transfer (bytes)','totalBytes',0],
 ['All image transfer (bytes)','imageBytes',0],['Menu image transfer (bytes)','menuImageBytes',0],
 ['Thumbnail requests','thumbnailCount',0],['Full-size menu requests','fullImageCount',0],
 ['Potential oversized image savings (bytes)','responsiveImageSavingsBytes',0]
]) lines.push(`| ${label} | ${runs.map(r => round(r[key],digits)).join(' | ')} | ${round(medians[key],digits)} |`);
lines.push('','Measured after App Hosting release SHA verification. Lighthouse metrics are simulated lab values.','');
const summary = lines.join('\n');
fs.writeFileSync('reports/summary.md',summary);
console.log(summary);
if(process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,summary);
