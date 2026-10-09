import { AppShell } from "@/components/shell/app-shell";
import { PlainFrame } from "@/components/shell/plain-frame";
import { getCurrentUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function InfoLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser().catch(() => null);
  return user ? <AppShell user={user}>{children}</AppShell> : <PlainFrame>{children}</PlainFrame>;
}
