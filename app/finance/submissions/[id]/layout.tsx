import { notFound } from "next/navigation";
import { FINANCE_ROLES, requireUser } from "@/lib/auth";
import { withClaims } from "@/lib/db";
import { isUuid } from "@/lib/ids";

export default async function SubmissionLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser(FINANCE_ROLES);
  const { id } = await params;
  const found =
    isUuid(id) &&
    (await withClaims(user.id, (tx) => tx.one<{ id: string }>("SELECT id FROM submission WHERE id = $1", [id])));
  if (!found) notFound();
  return children;
}
