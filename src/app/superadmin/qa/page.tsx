import { listQa } from './actions';
import { QaClientPage } from './client-page';

export default async function QaPage() {
  const items = await listQa();
  return <QaClientPage initialItems={items} />;
}
