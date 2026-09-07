import {test,expect,type Page} from '@playwright/test';
import * as admin from 'firebase-admin';
if(process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8088'||process.env.FIREBASE_AUTH_EMULATOR_HOST!=='127.0.0.1:9098')throw Error('Run only with local demo emulators');
const app=admin.initializeApp({projectId:'demo-orderfly-loyalty'},'loyalty-browser-seed');
const db=app.firestore();
const loyalty=(page:Page)=>page.locator('section').filter({has:page.getByRole('heading',{name:'Loyalty',exact:true})});
async function login(page:Page,email='browser@example.test'){
 const panel=loyalty(page);
 await panel.getByLabel('E-mail',{exact:true}).fill(email);
 await panel.getByLabel('Adgangskode',{exact:true}).fill('local-fixture-password');
 await panel.getByRole('button',{name:'Log ind',exact:true}).click();
}
async function purchase(page:Page,email='browser@example.test'){
 await page.getByLabel('Full Name',{exact:true}).fill('QA Loyalty');
 await page.getByLabel('Email',{exact:true}).fill(email);
 await page.getByLabel('Phone Number',{exact:true}).fill('12345678');
 await page.getByRole('checkbox',{name:/I accept the/}).first().check();
 await page.getByRole('button',{name:/Complete Order/}).first().click();
}
test.beforeAll(async()=>{
 await fetch('http://127.0.0.1:8088/emulator/v1/projects/demo-orderfly-loyalty/databases/(default)/documents',{method:'DELETE'});
 await fetch('http://127.0.0.1:9098/emulator/v1/projects/demo-orderfly-loyalty/accounts',{method:'DELETE'});
 await app.auth().createUser({uid:'browser-customer',email:'browser@example.test',emailVerified:true,password:'local-fixture-password'});
 await app.auth().createUser({uid:'unverified',email:'unverified@example.test',emailVerified:false,password:'local-fixture-password'});
 await db.doc('brands/b').set({name:'QA brand'});
 await db.doc('products/p').set({brandId:'b',locationIds:['l'],categoryId:'pizza',price:100});
 await db.doc('loyalty_programs/b').set({program:{enabled:true,earnPercent:5,minRedeemOre:100,maxRedeemPercent:50}});
});
test.afterAll(async()=>{await app.delete();});
test('verified customer earns, spends on next purchase, sees updated balance and logs out',async({page})=>{
 await page.goto('/');await login(page);
 await expect(loyalty(page).getByText(/Tilgængelig saldo:/)).toContainText('0,00');
 await purchase(page);
 await expect(page.getByRole('heading',{name:'Betaling registreret'})).toBeVisible();
 await expect(page.getByText('Betalt: 100 kr.',{exact:true})).toBeVisible();
 await expect(page.getByText('Optjent: 5 kr.',{exact:true})).toBeVisible();
 await expect(loyalty(page).getByText(/Tilgængelig saldo:/)).toContainText('5,00');
 await page.getByRole('link',{name:'Næste køb'}).click();
 await loyalty(page).getByRole('checkbox',{name:/Brug/}).check();
 await purchase(page);
 await expect(page.getByText('Betalt: 95 kr.',{exact:true})).toBeVisible();
 await expect(page.getByText('Indløst: 5 kr.',{exact:true})).toBeVisible();
 await expect(loyalty(page).getByText(/Tilgængelig saldo:/)).toContainText('4,75');
 await page.reload();await expect(loyalty(page).getByText(/Tilgængelig saldo:/)).toContainText('4,75');
 await loyalty(page).getByRole('button',{name:'Log ud',exact:true}).click();
 await expect(loyalty(page).getByText(/Tilgængelig saldo:/)).toHaveCount(0);
});
test('mismatched checkout email cannot reach payment and leaves no reservation',async({page})=>{
 await page.goto('/');await login(page);await expect(loyalty(page).getByText(/Tilgængelig saldo:/)).toBeVisible();
 const count=(await db.collection('orders').get()).size;
 await purchase(page,'someone-else@example.test');
 await expect(page.getByText('Brug den bekræftede e-mail fra din kundekonto.',{exact:true})).toBeVisible();
 expect((await db.collection('orders').get()).size).toBe(count);
 expect(page.url()).not.toContain('/paid');
});
test('unverified account has no balance or redemption controls',async({page})=>{
 await page.goto('/');await login(page,'unverified@example.test');
 await expect(loyalty(page).getByText('Bekræft din e-mail for at bruge loyalty.',{exact:true})).toBeVisible();
 await expect(loyalty(page).getByRole('checkbox',{name:/Brug/})).toHaveCount(0);
 await expect(loyalty(page).getByText(/Tilgængelig saldo:/)).toHaveCount(0);
});
test('cart-level discount prevents loyalty redemption in the actual checkout form',async({page})=>{
 await page.goto('/?blocked=1');await login(page);
 await expect(loyalty(page).getByText('Saldo kan ikke kombineres med kurvrabat eller rabatkode.',{exact:true})).toBeVisible();
 await expect(loyalty(page).getByRole('checkbox',{name:/Brug/})).toHaveCount(0);
});
