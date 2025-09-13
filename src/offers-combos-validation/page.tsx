
import { runOffersCombosValidationTests } from './actions';
import { OffersCombosValidationClientPage } from './client-page';

export default async function OffersCombosValidationPage() {
    const testResults = await runOffersCombosValidationTests();

    return (
        <OffersCombosValidationClientPage initialTestResults={testResults} />
    );
}
