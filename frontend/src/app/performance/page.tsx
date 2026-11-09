import { redirect } from "next/navigation";

// Performance foi incorporada ao Dashboard (página inicial).
export default function PerformanceRedirect() {
  redirect("/");
}
