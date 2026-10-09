import { AppShell } from "@/components/shell/app-shell";
import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser(["cbo_submitter"]);
  return <AppShell user={user}>{children}</AppShell>;
}
