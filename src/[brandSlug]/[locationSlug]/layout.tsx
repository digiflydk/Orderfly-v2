// NEUTRAL LAYOUT – INGEN IMPORTS, INGEN TYPER, INGEN DESTRUKTURERING
export const runtime = "nodejs";

export default async function Layout(props: {
  children: React.ReactNode;
  params: Promise<{ brandSlug: string; locationSlug: string }>;
}) {
  await props.params;
  return <>{props?.children}</>;
}
