import { AuthFrame } from "@/components/shell/auth-frame";
import { GateForm } from "./gate-form";

export const metadata = { title: "Passcode" };

export default async function GatePage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <AuthFrame>
      <h2 className="text-2xl font-bold text-ink">Enter the demonstration passcode</h2>
      <p className="mt-2 text-sm text-muted">This proof of concept is shared privately. Enter the passcode you were given to continue.</p>
      <GateForm next={next ?? ""} />
    </AuthFrame>
  );
}
