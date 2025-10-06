import type { ReactNode } from "react";
export const runtime = "nodejs";

type Props = {
  children: ReactNode;
  params?: any; // Gør param-typen fleksibel (Next genererer forskelligt)
};

export default function Layout({ children }: Props) {
  return <>{children}</>;
}
