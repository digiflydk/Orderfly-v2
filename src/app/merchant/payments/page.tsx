import { merchantPaymentLocations } from '@/lib/server/merchant-payment-settings';
import { PaymentSettings } from './payment-settings';
export const dynamic = 'force-dynamic';
export default async function PaymentMethodsPage() {
  return <div className="space-y-6"><h1 className="text-2xl font-bold">Betalingsmetoder</h1>
    <p>Vælg betalingsmetoder for hver restaurant. Mindst én metode skal være aktiv. Betal ved afhentning gælder kun afhentningsordrer.</p>
    <PaymentSettings locations={await merchantPaymentLocations()} />
  </div>;
}
