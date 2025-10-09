import { redirect } from "next/navigation";

export default function EditIndexRedirect() {
  redirect("/superadmin/feedback/questions");
}
