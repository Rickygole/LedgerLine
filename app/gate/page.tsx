import { AuthFrame } from "@/components/shell/auth-frame";
import { GateForm } from "./gate-form";

export const metadata = { title: "Access code" };

export default async function GatePage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <AuthFrame>
      <h1 className="text-2xl font-bold leading-8 text-ink">Enter your access code</h1>
      <p className="mt-2 text-base leading-6 text-ink">LedgerLine is available by invitation. Enter the passcode you were given to continue to sign in.</p>
      <GateForm next={next ?? ""} />
      <p className="mt-8 border-t border-line pt-5 text-sm leading-6 text-ink">Do not have a passcode? Ask the person who invited you to LedgerLine.</p>
    </AuthFrame>
  );
}
