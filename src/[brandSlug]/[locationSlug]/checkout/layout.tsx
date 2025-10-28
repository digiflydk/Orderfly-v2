// NEUTRAL LAYOUT – INGEN IMPORTS, INGEN TYPER, INGEN DESTRUKTURERING
export const runtime = "nodejs";

export default async function Layout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ brandSlug: string; locationSlug: string }>;
}) {
  await params;
  return <>{children}</>;
}
