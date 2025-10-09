

import { getBrands } from "@/app/superadmin/brands/actions";
import { CookieTextsFormPage } from "../form-page";
import { getPlatformSettings } from "@/app/superadmin/settings/actions";

export default async function NewCookieTextsPage() {
    const [brands, settings] = await Promise.all([
        getBrands(),
        getPlatformSettings(),
    ]);

    return (
        <CookieTextsFormPage 
            brands={brands} 
            supportedLanguages={settings.languageSettings.supportedLanguages}
        />
    );
}
