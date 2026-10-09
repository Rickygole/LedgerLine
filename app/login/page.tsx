import { redirect } from "next/navigation";
import { AuthFrame } from "@/components/shell/auth-frame";
import { getCurrentUser, homeFor } from "@/lib/auth";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in" };

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect(homeFor(user.role));
  return (
    <AuthFrame>
      <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-[28px] sm:leading-9">Sign in to LedgerLine</h1>
      <p className="mt-2 text-sm leading-6 text-muted">Use the account issued to you. Funded organizations see only the reports assigned to their EIN.</p>
      <LoginForm />
    </AuthFrame>
  );
}
