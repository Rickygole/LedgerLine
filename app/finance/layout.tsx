import { AppShell } from "@/components/shell/app-shell";
import { FINANCE_ROLES, requireUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function FinanceLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser(FINANCE_ROLES);
  return (
    <AppShell user={user}>
      {user.scopeNote ? (
        <p data-testid="scope-note" className="mb-4 text-sm text-muted">
          Showing initiatives in your access scope: {user.scopeNote}
        </p>
      ) : null}
      {children}
    </AppShell>
  );
}
