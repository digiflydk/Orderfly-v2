import { Header } from '@/components/layout/header';
import { Footer } from '@/components/layout/footer';
import { getWebsiteHeaderConfig } from '@/services/website';

export default async function HomePage() {
  const cfg = await getWebsiteHeaderConfig();

  return (
    <div className="flex min-h-screen flex-col bg-[#f3f7fd]">
      {/* Public header bruger CMS-styret linkClass */}
      <Header linkClass={cfg.linkClass} />

      <main className="flex-1">
        {/* Din eksisterende forside-indhold/hero */}
        <section className="mx-auto max-w-[1140px] px-4 py-12">
          <h1 className="text-4xl font-bold">Alt-i-en salgsplatform</h1>
          <p className="mt-3 text-lg text-neutral-600">
            Bygget til Take Away &amp; Horeca.
          </p>
        </section>
      </main>

      {/* Public footer (hvis du har en særlig Website-footer, behold den her) */}
      <Footer
        brand={{ id: 'public', name: 'OrderFly', appearances: {} as any } as any}
        version="Version 1.0.95 • OF-273"
      />
    </div>
  );
}
