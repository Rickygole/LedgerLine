import { LockKeyhole } from "lucide-react";
import { AuthFrame } from "@/components/shell/auth-frame";
import { GateForm } from "./gate-form";

export const metadata = { title: "Access code" };

export default async function GatePage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <AuthFrame>
      <span className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl bg-navy-50 text-navy-700 ring-1 ring-navy-100" aria-hidden="true">
        <LockKeyhole className="h-5 w-5" />
      </span>
      <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-[28px] sm:leading-9">Enter your access code</h1>
      <p className="mt-2 text-sm leading-6 text-muted">This site is available by invitation. Enter the access code you were given to continue.</p>
      <GateForm next={next ?? ""} />
    </AuthFrame>
  );
}
