import type { Metadata } from "next";
import { getCurrentUser, roleLabel } from "@/lib/auth";
import { RequestReference } from "@/components/ops/request-reference";
import { MissingPage } from "@/components/shell/missing-page";

export const metadata: Metadata = { title: "Page not found" };

export default async function NotFound() {
  const user = await getCurrentUser().catch(() => null);
  return (
    <>
      <MissingPage role={user?.role ?? null} roleText={user ? roleLabel(user.role) : null} />
      <RequestReference />
    </>
  );
}
