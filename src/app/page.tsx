
import { redirect } from "next/navigation";

export const runtime = "nodejs";

export default function RootRedirect() {
  redirect("/m3");
}
