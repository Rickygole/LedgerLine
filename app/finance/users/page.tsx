import type { Metadata } from "next";
import { Check, Clock, X } from "lucide-react";
import { requireUser, roleLabel } from "@/lib/auth";
import { withClaims } from "@/lib/db";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/status-badge";
import { Input, Select } from "@/components/ui/field";
import { Table, THead, TH, TR, TD, EmptyRow } from "@/components/ui/table";
import { FilterBar, FilterField } from "@/components/finance/admin/filter-bar";
import { Pagination } from "@/components/finance/admin/pagination";
import { CreateUserForm } from "@/components/finance/admin/create-user-form";
import { UserActions } from "@/components/finance/admin/user-actions";
import { listUsers } from "@/lib/finance/admin/users";
import { one, pageNumber, PAGE_SIZE, type SearchParams } from "@/lib/finance/admin/params";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Users" };

const ROLES = ["finance_viewer", "finance_analyst", "finance_admin", "cbo_submitter"] as const;

export default async function UsersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const admin = await requireUser(["finance_admin"]);
  const params = await searchParams;
  const q = one(params, "q");
  const role = (ROLES as readonly string[]).includes(one(params, "role")) ? one(params, "role") : "";
  const page = pageNumber(params);
  const { list, orgs } = await withClaims(admin.id, async (tx) => ({
    list: await listUsers(tx, { q, role, page }),
    orgs: await tx.query<{ id: string; name: string; ein: string }>(`SELECT id, legal_name AS name, ein FROM organization ORDER BY legal_name`),
  }));
  const { rows, total } = list;

  const base = "/finance/users";
  const kept = { q, role };

  return (
    <>
      <PageHeader title="Users" description="Manage who can use LedgerLine. Changes are written to the audit log." crumbs={[{ label: "Dashboard", href: "/finance" }, { label: "Users" }]} />
      <Card className="mb-6">
        <CardHeader title="Add a user" description="Create a Finance account or an account for a funded organization." />
        <CreateUserForm orgs={orgs} />
      </Card>
      <Card>
        <FilterBar action={base} clearHref={base} applied={role ? 1 : 0}>
          <FilterField label="Search" htmlFor="q" className="min-w-64 flex-1">
            <Input id="q" name="q" type="search" defaultValue={q} placeholder="Name, email or organization" />
          </FilterField>
          <FilterField label="Role" htmlFor="role">
            <Select id="role" name="role" defaultValue={role}>
              <option value="">All roles</option>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {roleLabel(r)}
                </option>
              ))}
            </Select>
          </FilterField>
        </FilterBar>
        <Table density="compact" stack>
          <THead>
            <tr>
              <TH>Name</TH>
              <TH>Email</TH>
              <TH>Role</TH>
              <TH>Organization</TH>
              <TH>Status</TH>
              <TH>
                <span className="sr-only">Actions</span>
              </TH>
            </tr>
          </THead>
          <tbody>
            {rows.length === 0 ? (
              <EmptyRow colSpan={6}>No users match these filters.</EmptyRow>
            ) : (
              rows.map((u) => (
                <TR key={u.id}>
                  <TD className="min-w-[11rem]" primary>
                    <span className="font-semibold">{u.full_name}</span>
                    {u.id === admin.id ? <span className="ml-2 rounded-sm bg-navy-800 px-1.5 py-px text-[11px] font-semibold text-white">You</span> : null}
                    {u.title ? <div className="text-xs font-normal text-muted">{u.title}</div> : null}
                  </TD>
                  <TD className="whitespace-nowrap text-muted" label="Email">
                    <span>{u.email}</span>
                  </TD>
                  <TD className="whitespace-nowrap" label="Role">
                    <span>{roleLabel(u.role)}</span>
                  </TD>
                  <TD className="max-w-56" label="Organization">
                    {u.org_name ? <span>{u.org_name}</span> : <span className="whitespace-nowrap text-muted">Council Finance</span>}
                  </TD>
                  <TD className="whitespace-nowrap" label="Status">
                    <span>
                      {!u.active ? (
                        <Badge icon={X}>Deactivated</Badge>
                      ) : u.can_sign_in ? (
                        <Badge tone="ok" icon={Check}>
                          Active
                        </Badge>
                      ) : (
                        <Badge tone="info" icon={Clock}>
                          Invited, no password yet
                        </Badge>
                      )}
                    </span>
                  </TD>
                  <TD className="text-right" action>
                    <UserActions userId={u.id} name={u.full_name} email={u.email} role={u.role} active={u.active} isSelf={u.id === admin.id} isCbo={u.role === "cbo_submitter"} />
                  </TD>
                </TR>
              ))
            )}
          </tbody>
        </Table>
        <Pagination base={base} params={kept} page={page} pageSize={PAGE_SIZE} total={total} />
      </Card>
    </>
  );
}
