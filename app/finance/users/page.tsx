import type { Metadata } from "next";
import { Check, X } from "lucide-react";
import { requireUser, roleLabel } from "@/lib/auth";
import { withClaims } from "@/lib/db";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/status-badge";
import { Input, Select } from "@/components/ui/field";
import { monogram } from "@/components/ui/profile-header";
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
        <FilterBar action={base} clearHref={base}>
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
        <Table>
          <THead>
            <tr>
              <TH>Name</TH>
              <TH>Email</TH>
              <TH>Role</TH>
              <TH>Organization</TH>
              <TH>Can sign in</TH>
              <TH>Status</TH>
              <TH>Actions</TH>
            </tr>
          </THead>
          <tbody>
            {rows.length === 0 ? (
              <EmptyRow colSpan={7}>No users match these filters.</EmptyRow>
            ) : (
              rows.map((u) => (
                <TR key={u.id}>
                  <TD>
                    <div className="flex items-start gap-3">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-navy-100 text-[11px] font-bold text-navy-800" aria-hidden="true">
                        {monogram(u.full_name)}
                      </span>
                      <div className="min-w-0">
                        <span className="font-semibold">{u.full_name}</span>
                        {u.id === admin.id ? <span className="ml-2 rounded-full bg-navy-800 px-1.5 py-px text-[11px] font-semibold text-white">You</span> : null}
                        {u.title ? <div className="text-xs text-muted">{u.title}</div> : null}
                      </div>
                    </div>
                  </TD>
                  <TD className="text-muted">{u.email}</TD>
                  <TD className="whitespace-nowrap">{roleLabel(u.role)}</TD>
                  <TD className="max-w-56">{u.org_name ?? <span className="whitespace-nowrap text-muted">Council Finance</span>}</TD>
                  <TD>
                    {u.can_sign_in ? (
                      <Badge tone="ok" icon={Check}>
                        Yes
                      </Badge>
                    ) : (
                      <Badge icon={X}>No</Badge>
                    )}
                  </TD>
                  <TD>{u.active ? <Badge tone="ok" icon={Check}>Active</Badge> : <Badge tone="bad" icon={X}>Inactive</Badge>}</TD>
                  <TD>
                    <UserActions userId={u.id} name={u.full_name} role={u.role} active={u.active} isSelf={u.id === admin.id} isCbo={u.role === "cbo_submitter"} />
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
