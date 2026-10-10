import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthFrame } from "@/components/shell/auth-frame";
import { getCurrentUser, homeFor } from "@/lib/auth";
import { safeNext } from "@/lib/redirect";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; reset?: string }>;
}) {
  const params = await searchParams;
  const next = safeNext(params.next, "");
  const user = await getCurrentUser();
  if (user) redirect(safeNext(next, homeFor(user.role)));
  return (
    <AuthFrame>
      <h1 className="text-[26px] font-extrabold leading-8 tracking-[-0.015em] text-ink sm:text-[32px] sm:leading-10">
        Sign in to LedgerLine
      </h1>
      <p className="mt-2 text-lg leading-7 text-ink-2">Use your work email and password.</p>
      {params.reset === "1" ? (
        <p role="status" className="mt-6 border-l-4 border-ok bg-ok-bg px-4 py-3 text-base font-semibold text-ink">
          Your password was saved. Sign in with it below.
        </p>
      ) : null}
      <LoginForm next={next} />
      <div className="mt-8 border-t border-line-soft pt-6 text-base leading-6 text-ink">
        <p>Need an account? Your organization&apos;s primary contact or Council Finance can add you.</p>
        <p className="mt-3">
          Trouble signing in? See{" "}
          <Link href="/help#sign-in" className="text-link underline underline-offset-2 hover:text-link-hover">
            Help and contact
          </Link>
          . Support is open Monday to Friday, 9 AM to 5 PM ET.
        </p>
        <p className="mt-4 text-sm leading-5 text-muted">
          This system is for authorized users. Sign-in and account activity are recorded.
        </p>
      </div>
    </AuthFrame>
  );
}
