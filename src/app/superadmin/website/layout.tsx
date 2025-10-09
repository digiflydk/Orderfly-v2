export const runtime = "nodejs";

// Neutral layout: ingen typer, ingen imports, ingen destrukturering af props.
export default function Layout(props: any) {
  return <>{props?.children}</>;
}
