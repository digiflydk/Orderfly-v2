export const runtime = "nodejs";

// VIGTIGT: ingen imports, ingen typer, ingen destrukturering
export default function Layout(props: any) {
  return <>{props?.children}</>;
}
