
import { notFound } from 'next/navigation';
import { getCookieTextById } from '@/app/superadmin/settings/cookie-texts/actions';
import { getBrands } from '@/app/superadmin/brands/actions';
import { CookieTextsFormPage } from '../../form-page';
import { getPlatformSettings } from '@/app/superadmin/settings/actions';

type EditCookieTextsPageProps = {
  params: {
    textId: string;
  };
};

export default async function EditCookieTextsPage({ params }: EditCookieTextsPageProps) {
  const { textId } = params;

  if (!textId) {
    notFound();
  }

  const [textSet, brands, settings] = await Promise.all([
    getCookieTextById(textId),
    getBrands(),
    getPlatformSettings(),
  ]);

  if (!textSet) {
    notFound();
  }

  return (
    <CookieTextsFormPage
      brands={brands}
      textSet={textSet}
      supportedLanguages={settings.languageSettings.supportedLanguages}
    />
  );
}
