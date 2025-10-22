
// NEUTRAL LAYOUT – INGEN IMPORTS, INGEN TYPER, INGEN DESTRUKTURERING
export const runtime = "nodejs";

export default async function Layout(props: {
  children: React.ReactNode;
  params: Promise<{ brandSlug: string; locationSlug: string }>;
}) {
  // This layout is intentionally minimal. It passes children through to inherit
  // the layout from its parent at `/[brandSlug]/[locationSlug]/layout.tsx`.
  // The parent layout is responsible for rendering the correct header and background.
  return <>{props?.children}</>;
}
