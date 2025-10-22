
// NEUTRAL LAYOUT – INGEN IMPORTS, INGEN TYPER, INGEN DESTRUKTURERING
export const runtime = "nodejs";

export default function Layout(props: { children: React.ReactNode }) {
  return <>{props?.children}</>;
}
