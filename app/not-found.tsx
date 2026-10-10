import type { Metadata } from "next";
import { getCurrentUser, roleLabel, type CurrentUser } from "@/lib/auth";
import { AppShell } from "@/components/shell/app-shell";
import { RequestReference } from "@/components/ops/request-reference";
import { MissingPage } from "@/components/shell/missing-page";
import { PlainFrame } from "@/components/shell/plain-frame";

export const metadata: Metadata = { title: "Page not found" };

export default async function NotFound() {
  let user: CurrentUser | null = null;
  try {
    user = await getCurrentUser();
  } catch {
    user = null;
  }
  const content = (
    <>
      <MissingPage role={user?.role ?? null} roleText={user ? roleLabel(user.role) : null} />
      <RequestReference />
    </>
  );
  return user ? <AppShell user={user}>{content}</AppShell> : <PlainFrame>{content}</PlainFrame>;
}
