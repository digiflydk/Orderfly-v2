
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "default-no-store";

import "server-only";
import Image from "next/image";
import Link from "next/link";
import { getAdminDb } from "@/lib/firebase-admin";

type HeaderDoc = {
  appearance?: {
    headerHeight?: number;
    headerIsSticky?: boolean;
    headerLinkColor?: string;
    navLinks?: { label: string; href: string }[];
    logo?: { src: string; alt?: string; maxWidth?: number };
  };
  version?: number;
};

type SettingsGeneral = {
  companyName?: string;
  websiteTitle?: string;
  heroHeadline?: string;
  heroDescription?: string;
  heroImageUrl?: string;
  heroCtaText?: string;
  heroCtaLink?: string;
  logoUrl?: string;
  footerLogoUrl?: string;
};

async function loadCms() {
  const db = getAdminDb();
  // Hent docs parallelt — men lad hver enkelt fejle uden at tage hele siden ned
  const [settingsSnap, headerSnap, homeSnap] = await Promise.allSettled([
    db.doc("settings/general").get(),
    db.doc("cms/pages/header/header").get(),
    db.doc("cms/pages/home/home").get(), // valgfrit; OK hvis not found
  ]);

  const settings: SettingsGeneral | null =
    settingsSnap.status === "fulfilled" && settingsSnap.value.exists
      ? (settingsSnap.value.data() as any)
      : null;

  const header: HeaderDoc | null =
    headerSnap.status === "fulfilled" && headerSnap.value.exists
      ? (headerSnap.value.data() as any)
      : null;

  const home: any =
    homeSnap.status === "fulfilled" && homeSnap.value.exists
      ? (homeSnap.value.data() as any)
      : null;

  return { settings, header, home };
}

function pick<T>(v: T | null | undefined, fallback: T) {
  return v ?? fallback;
}

export default async function HomePage() {
  let data: Awaited<ReturnType<typeof loadCms>>;
  try {
    data = await loadCms();
  } catch (e) {
    // Helt fail-safe: hvis Admin/Firestore ikke kan nås, vis en pæn, statisk landing.
    return (
      <main className="min-h-screen flex flex-col">
        <SimpleHeader />
        <Hero
          title="Orderfly"
          description="Alt-i-én bestillingsplatform — skaleret til din forretning."
          ctaText="Gå til Superadmin"
          ctaLink="/superadmin"
          imageUrl={undefined}
        />
        <FooterSimple />
      </main>
    );
  }

  const company = pick(data.settings?.companyName, "Orderfly");
  const websiteTitle = pick(data.settings?.websiteTitle, company);
  const heroTitle = pick(data.settings?.heroHeadline, "Flow. Automatisér. Skalér.");
  const heroDesc = pick(
    data.settings?.heroDescription,
    "Byg og driv en moderne bestillingsoplevelse — hurtigt og sikkert."
  );
  const heroCtaText = pick(data.settings?.heroCtaText, "Kom i gang");
  const heroCtaLink = pick(data.settings?.heroCtaLink, "/superadmin");
  const heroImage = data.settings?.heroImageUrl;

  const logoSrc =
    data.header?.appearance?.logo?.src ??
    data.settings?.logoUrl ??
    "/favicon.ico";

  const navLinks =
    data.header?.appearance?.navLinks ?? [
      { label: "Superadmin", href: "/superadmin" },
    ];

  return (
    <main className="min-h-screen flex flex-col">
      <Header title={websiteTitle} logoSrc={logoSrc} navLinks={navLinks} />
      <Hero
        title={heroTitle}
        description={heroDesc}
        ctaText={heroCtaText}
        ctaLink={heroCtaLink}
        imageUrl={heroImage}
      />
      <Features />
      <Footer company={company} />
    </main>
  );
}

/* ================= UI-blokke (enkle, pæne defaults) ================= */

function Header({
  title,
  logoSrc,
  navLinks,
}: {
  title: string;
  logoSrc?: string;
  navLinks: { label: string; href: string }[];
}) {
  return (
    <header className="sticky top-0 bg-white/80 backdrop-blur supports-[backdrop-filter]:bg-white/60 border-b">
      <div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {logoSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoSrc} alt={title} className="h-8 w-auto" />
          ) : (
            <div className="h-8 w-8 rounded bg-black" />
          )}
          <span className="font-semibold">{title}</span>
        </div>
        <nav className="flex items-center gap-6 text-sm">
          {navLinks.map((l) => (
            <Link key={l.href} href={l.href} className="text-gray-600 hover:text-black">
              {l.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}

function SimpleHeader() {
  return (
    <header className="border-b">
      <div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between">
        <span className="font-semibold">Orderfly</span>
        <Link href="/superadmin" className="text-sm text-gray-600 hover:text-black">
          Superadmin
        </Link>
      </div>
    </header>
  );
}

function Hero({
  title,
  description,
  ctaText,
  ctaLink,
  imageUrl,
}: {
  title: string;
  description: string;
  ctaText: string;
  ctaLink: string;
  imageUrl?: string;
}) {
  return (
    <section className="mx-auto max-w-6xl px-4 py-16 grid md:grid-cols-2 gap-10 items-center">
      <div>
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight">{title}</h1>
        <p className="mt-4 text-gray-600">{description}</p>
        <div className="mt-6">
          <Link
            href={ctaLink}
            className="inline-flex items-center rounded-md bg-black px-5 py-3 text-white hover:bg-gray-800"
          >
            {ctaText}
          </Link>
        </div>
      </div>
      <div className="relative aspect-[16/10] w-full overflow-hidden rounded-xl border bg-gray-50">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="h-full w-full grid place-items-center text-gray-400">
            (hero image)
          </div>
        )}
      </div>
    </section>
  );
}

function Features() {
  const items = [
    { title: "Hurtig bestilling", body: "Konverter flere kunder med en friktionsfri ordre-oplevelse." },
    { title: "Skalerbart", body: "Fra én butik til kæde—platformen vokser med jer." },
    { title: "Analytics", body: "Forstå kunderejsen og optimer menu og flows." },
  ];
  return (
    <section className="mx-auto max-w-6xl px-4 pb-20">
      <div className="grid md:grid-cols-3 gap-6">
        {items.map((it) => (
          <div key={it.title} className="rounded-xl border p-6">
            <h3 className="font-semibold">{it.title}</h3>
            <p className="mt-2 text-gray-600 text-sm">{it.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function Footer({ company }: { company: string }) {
  return (
    <footer className="mt-auto border-t">
      <div className="mx-auto max-w-6xl px-4 py-8 text-sm text-gray-500 flex items-center justify-between">
        <span>© {new Date().getFullYear()} {company}</span>
        <Link href="/superadmin" className="hover:text-gray-700">Superadmin</Link>
      </div>
    </footer>
  );
}

function FooterSimple() {
  return (
    <footer className="mt-auto border-t">
      <div className="mx-auto max-w-6xl px-4 py-8 text-sm text-gray-500">
        © {new Date().getFullYear()} Orderfly
      </div>
    </footer>
  );
}
