
import { getBrands } from "@/app/superadmin/brands/actions";
import { getCookieTexts } from "./actions";
import { CookieTextsClientPage } from "./client-page";

export const revalidate = 0;

export default async function CookieTextsPage() {
    const [texts, brands] = await Promise.all([
        getCookieTexts(),
        getBrands(),
    ]);

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold tracking-tight">Cookie Consent Texts</h1>
                <p className="text-muted-foreground">
                    Manage the text content displayed in the cookie consent banner and modal across different languages and versions.
                </p>
            </div>
            <CookieTextsClientPage 
                initialTexts={texts}
                brands={brands}
            />
        </div>
    );
}
