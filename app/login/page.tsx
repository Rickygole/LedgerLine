import { redirect } from "next/navigation";
import { AuthFrame } from "@/components/shell/auth-frame";
import { getCurrentUser, homeFor } from "@/lib/auth";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in" };

const DEMO_ACCOUNTS = [
  { name: "Maria Santos", role: "Program Director, Mott Haven Youth Futures", email: "maria.santos@motthavenyouth.example.org" },
  { name: "James Okafor", role: "Finance Manager, Mott Haven Youth Futures", email: "james.okafor@motthavenyouth.example.org" },
  { name: "Daniel Cho", role: "Budget Analyst, Council Finance", email: "daniel.cho@finance.example.gov" },
  { name: "Priya Raman", role: "Finance Administrator, Council Finance", email: "priya.raman@finance.example.gov" },
];

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect(homeFor(user.role));
  return (
    <AuthFrame>
      <h2 className="text-2xl font-bold text-ink">Sign in to LedgerLine</h2>
      <p className="mt-2 text-sm text-muted">Each person signs in with their own account. Funded organizations see only the reports assigned to their EIN.</p>
      <LoginForm accounts={DEMO_ACCOUNTS} />
    </AuthFrame>
  );
}
