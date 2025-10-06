import type { ReactNode } from "react";
export const runtime = "nodejs";

export default function Layout(props: { children: ReactNode }) {
  return <>{props.children}</>;
}
