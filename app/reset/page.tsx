import Link from "next/link";
import { AuthFrame } from "@/components/shell/auth-frame";
import { anonymous } from "@/lib/db";
import { hashToken, isTokenFormat } from "@/lib/password";
import { ResetForm } from "./reset-form";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata = { title: "Choose a password", referrer: "no-referrer" as const };

export default async function ResetPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = "" } = await searchParams;
  const info = isTokenFormat(token)
    ? (await anonymous<{ email: string; full_name: string; purpose: string }>("SELECT email, full_name, purpose FROM app.password_token_info($1)", [hashToken(token)]))[0]
    : undefined;
  return (
    <AuthFrame>
      {info ? (
        <>
          <h1 className="text-[26px] font-extrabold leading-8 tracking-[-0.015em] text-ink sm:text-[32px] sm:leading-10">{info.purpose === "invite" ? "Set your password" : "Choose a new password"}</h1>
          <p className="mt-2 text-lg leading-7 text-ink-2">
            Account for {info.full_name} ({info.email}). The link you used works once and stops working 30 minutes after it was issued.
          </p>
          <ResetForm token={token} email={info.email} />
          <p className="mt-8 border-t border-line-soft pt-6 text-base leading-6 text-ink">
            Problems with this link? See{" "}
            <Link href="/help#sign-in" className="text-link underline underline-offset-2 hover:text-link-hover">
              Help
            </Link>{" "}
            or contact Council Finance.
          </p>
        </>
      ) : (
        <>
          <h1 className="text-[26px] font-extrabold leading-8 tracking-[-0.015em] text-ink sm:text-[32px] sm:leading-10">This link cannot be used</h1>
          <p className="mt-2 text-lg leading-7 text-ink-2">The link has expired, was already used, or is not complete. Ask Council Finance to send you a new one.</p>
          <p className="mt-6 text-base">
            <Link href="/login" className="text-link underline underline-offset-2 hover:text-link-hover">
              Back to sign in
            </Link>
          </p>
        </>
      )}
    </AuthFrame>
  );
}
