import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import ts from 'typescript';

async function mount(page: any, results: any[], proof = true) {
  await page.route('https://checkout.test/**', (route: any) => route.fulfill({ contentType: 'text/html', body: '<main id="root"></main>' }));
  await page.goto(`https://checkout.test/brand/location/checkout/cancel?${proof ? `order_id=ORD-123&token=${'a'.repeat(64)}` : 'status=canceled&error=synthetic-private-error'}`);
  await page.addScriptTag({ content: fs.readFileSync('node_modules/react/umd/react.development.js', 'utf8') });
  await page.addScriptTag({ content: fs.readFileSync('node_modules/react-dom/umd/react-dom.development.js', 'utf8') });
  const code = ts.transpileModule(fs.readFileSync('src/components/checkout/payment-cancellation.tsx', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } }).outputText;
  await page.evaluate(({ code, results }: any) => {
    const w = window as any, R = w.React; w.cancellationCalls = []; w.cancellationResults = results;
    const primitive = (tag: string) => (props: any) => R.createElement(tag, { ...props, asChild: undefined, variant: undefined }, props.children);
    const ui = new Proxy({}, { get: (_, name: string) => primitive(name.includes('Title') ? 'h2' : name.includes('Button') ? 'button' : 'div') });
    const require = (name: string): any => {
      if (name === 'react') return R;
      if (name === 'next/link') return { default: primitive('a') };
      if (name === 'next/navigation') return { useParams: () => ({ brandSlug: 'brand', locationSlug: 'location' }), useSearchParams: () => new URLSearchParams(location.search) };
      if (name === 'lucide-react') return new Proxy({}, { get: () => primitive('span') });
      if (name.includes('/ui/')) return ui;
      if (name.includes('use-storefront-path')) return { useStorefrontPath: () => () => '/brand/location/checkout' };
      if (name.includes('cancel-actions')) return { cancelCheckout: async (orderId: string, token: string) => {
        w.cancellationCalls.push({ orderId, token });
        const result = w.cancellationResults.shift();
        if (result?.throws) throw Error('synthetic-private-provider-error');
        return result;
      } };
      throw Error('Unmocked cancellation fixture import ' + name);
    };
    const exports: any = {}; new Function('require', 'exports', 'React', code)(require, exports, R);
    w.ReactDOM.createRoot(document.getElementById('root')).render(R.createElement(exports.default));
  }, { code, results });
}

test('unknown cancellation remains pending until an explicit same-operation check is provider-confirmed', async ({ page }) => {
  await mount(page, [{ status: 'pending', code: 'WORLDLINE_CANCEL_EXPIRY_HTTP_404' }, { status: 'canceled' }]);
  await expect(page.getByRole('heading', { name: 'Annulleringen afventer bekræftelse' })).toBeVisible();
  await expect(page.getByText('Fejlkode: WORLDLINE_CANCEL_EXPIRY_HTTP_404')).toBeVisible();
  await expect(page.getByText(/Betal ikke igen/)).toBeVisible();
  await expect(page.getByRole('link', { name: 'Tilbage til kassen' })).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).cancellationCalls.length)).toBe(1);
  await page.getByRole('button', { name: 'Kontrollér annulleringen' }).click();
  await expect(page.getByRole('heading', { name: 'Betalingen er annulleret' })).toBeVisible();
  expect(await page.evaluate(() => (window as any).cancellationCalls)).toEqual([{ orderId: 'ORD-123', token: 'a'.repeat(64) }, { orderId: 'ORD-123', token: 'a'.repeat(64) }]);
  await expect(page.getByRole('link', { name: 'Tilbage til kassen' })).toBeVisible();
});
test('paid cancellation outcome never offers a new checkout or claims unpaid cancellation', async ({ page }) => {
  await mount(page, [{ status: 'paid' }]);
  await expect(page.getByRole('heading', { name: 'Betalingen er gennemført' })).toBeVisible();
  await expect(page.getByText('Din betaling er gennemført. Betal ikke igen.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Betalingen er annulleret' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Tilbage til kassen' })).toHaveCount(0);
});
test('missing capability and browser status cannot cancel or expose arbitrary query errors', async ({ page }) => {
  await mount(page, [], false);
  await expect(page.getByRole('heading', { name: 'Annulleringen kunne ikke bekræftes' })).toBeVisible();
  expect(await page.evaluate(() => (window as any).cancellationCalls)).toEqual([]);
  await expect(page.getByText('synthetic-private-error')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Betalingen er annulleret' })).toHaveCount(0);
});
test('unknown transport errors and unsafe diagnostic strings never leak provider details', async ({ page }) => {
  await mount(page, [{ throws: true }, { status: 'pending', code: 'synthetic-private-provider-error' }]);
  await expect(page.getByRole('heading', { name: 'Annulleringen kunne ikke bekræftes' })).toBeVisible();
  await expect(page.getByText('synthetic-private-provider-error')).toHaveCount(0);
  await page.getByRole('button', { name: 'Prøv at annullere igen' }).click();
  await expect(page.getByRole('heading', { name: 'Annulleringen afventer bekræftelse' })).toBeVisible();
  await expect(page.getByText('synthetic-private-provider-error')).toHaveCount(0);
  await expect(page.getByText(/Fejlkode:/)).toHaveCount(0);
});

test('provider expiry diagnostic remains pending and never offers a new checkout',async({page})=>{
  const code='WORLDLINE_CANCEL_EXPIRY_HTTP_403_PROVIDER_40200_SRC_BEC_REASON_SESSION_EXPIRED';
  await mount(page,[{status:'pending',code}]);
  await expect(page.getByRole('heading',{name:'Annulleringen afventer bekræftelse'})).toBeVisible();
  await expect(page.getByText('Fejlkode: '+code,{exact:true})).toBeVisible();
  await expect(page.getByText(/Betal ikke igen/)).toBeVisible();
  await expect(page.getByRole('heading',{name:'Betalingen er annulleret'})).toHaveCount(0);
  await expect(page.getByRole('link',{name:'Tilbage til kassen'})).toHaveCount(0);
  expect(await page.evaluate(()=>(window as any).cancellationCalls.length)).toBe(1);
});
