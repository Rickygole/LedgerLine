import { redirect } from "next/navigation";
import { AuthFrame } from "@/components/shell/auth-frame";
import { getCurrentUser, homeFor } from "@/lib/auth";
import { safeNext } from "@/lib/redirect";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; reset?: string }> }) {
  const params = await searchParams;
  const next = safeNext(params.next, "");
  const user = await getCurrentUser();
  if (user) redirect(safeNext(next, homeFor(user.role)));
  return (
    <AuthFrame>
      <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-[28px] sm:leading-9">Sign in to LedgerLine</h1>
      <p className="mt-2 text-sm leading-6 text-muted">Use the account issued to you. Funded organizations see only the reports assigned to their EIN.</p>
      {params.reset === "1" ? (
        <p role="status" className="mt-5 rounded-md border border-ok/30 bg-ok-bg px-4 py-3 text-sm font-semibold text-ok">
          Your password was saved. Sign in with it below.
        </p>
      ) : null}
      <LoginForm next={next} />
    </AuthFrame>
  );
}
