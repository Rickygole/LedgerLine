import type { Metadata } from "next";
import { getCurrentUser, roleLabel } from "@/lib/auth";
import { AppShell } from "@/components/shell/app-shell";
import { ForbiddenPanel } from "@/components/shell/missing-page";
import { PlainFrame } from "@/components/shell/plain-frame";

export const metadata: Metadata = { title: "No access" };

export default async function Forbidden() {
  const user = await getCurrentUser().catch(() => null);
  const content = <ForbiddenPanel role={user?.role ?? null} roleText={user ? roleLabel(user.role) : null} />;
  return user ? <AppShell user={user}>{content}</AppShell> : <PlainFrame>{content}</PlainFrame>;
}
