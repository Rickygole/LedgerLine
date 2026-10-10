import { AuthFrame } from "@/components/shell/auth-frame";
import { GateForm } from "./gate-form";

export const metadata = { title: "Access code" };

export default async function GatePage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <AuthFrame>
      <h1 className="text-[26px] font-extrabold leading-8 tracking-[-0.015em] text-ink sm:text-[32px] sm:leading-10">
        Enter your access code
      </h1>
      <p className="mt-2 text-lg leading-7 text-ink-2">
        LedgerLine is available by invitation. Enter the passcode you were given to continue.
      </p>
      <GateForm next={next ?? ""} />
      <p className="mt-8 border-t border-line-soft pt-6 text-base leading-6 text-ink">
        Do not have a passcode? Ask the person who invited you to LedgerLine.
      </p>
    </AuthFrame>
  );
}
