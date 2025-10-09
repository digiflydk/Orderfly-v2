
import { runDiscountValidationTests } from './actions';
import { DiscountValidationClientPage } from './client-page';

export const revalidate = 0;

export default async function DiscountValidationPage() {
    const testResults = await runDiscountValidationTests();

    return (
        <DiscountValidationClientPage initialTestResults={testResults} />
    );
}
