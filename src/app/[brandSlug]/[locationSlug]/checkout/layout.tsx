// Server component (ingen "use client" her medmindre I bruger hooks der kræver det)
export const runtime = "nodejs";

type LayoutProps = {
  children: React.ReactNode;
  params: {
    brandSlug: string;
    locationSlug: string;
  };
};

export default function CheckoutLayout({ children /*, params*/ }: LayoutProps) {
  // Hvis I skal bruge brandSlug/locationSlug, destrukturer dem:
  // const { brandSlug, locationSlug } = params;

  return <>{children}</>;
}
