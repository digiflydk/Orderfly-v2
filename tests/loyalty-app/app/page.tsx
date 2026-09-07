import {CheckoutClient} from '@/components/checkout/checkout-client';
import {FixtureCart} from '../fixtures/cart';
import {location} from '../fixtures/data';
export default async function Page({searchParams}:{searchParams:Promise<{blocked?:string}>}){const q=await searchParams;return <FixtureCart blocked={!!q.blocked}><CheckoutClient location={location}/></FixtureCart>;}
