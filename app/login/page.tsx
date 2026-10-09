import Link from "next/link";
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
      <h1 className="text-2xl font-bold leading-8 text-ink">Sign in</h1>
      <p className="mt-2 text-base leading-6 text-ink">Use the work email and password for your LedgerLine account.</p>
      {params.reset === "1" ? (
        <p role="status" className="mt-5 border-l-4 border-ok bg-ok-bg px-4 py-3 text-sm font-semibold text-ink">
          Your password was saved. Sign in with it below.
        </p>
      ) : null}
      <LoginForm next={next} />
      <div className="mt-8 border-t border-line pt-5 text-sm leading-6 text-ink">
        <p>
          Need help signing in? Contact your LedgerLine administrator or Council Finance. Support hours are on the{" "}
          <Link href="/help" className="text-link underline underline-offset-2 hover:text-link-hover">
            Help
          </Link>{" "}
          page.
        </p>
        <p className="mt-3 text-muted">This system is for authorized users. Sign-in and account activity are recorded.</p>
      </div>
    </AuthFrame>
  );
}
