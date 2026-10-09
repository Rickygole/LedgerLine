import type { Metadata } from "next";
import { Check, X } from "lucide-react";
import { requireUser, roleLabel } from "@/lib/auth";
import { withClaims } from "@/lib/db";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/status-badge";
import { Input, Select } from "@/components/ui/field";
import { Table, THead, TH, TR, TD, EmptyRow } from "@/components/ui/table";
import { FilterBar, FilterField } from "@/components/finance/admin/filter-bar";
import { Pagination } from "@/components/finance/admin/pagination";
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
  const { rows, total } = await withClaims(admin.id, (tx) => listUsers(tx, { q, role, page }));

  const base = "/finance/users";
  const kept = { q, role };

  return (
    <>
      <PageHeader title="Users" description="Manage who can use LedgerLine. Changes are written to the audit log." crumbs={[{ label: "Dashboard", href: "/finance" }, { label: "Users" }]} />
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
                <TR key={u.id} className="align-top">
                  <TD>
                    <span className="font-semibold">{u.full_name}</span>
                    {u.title ? <div className="text-xs text-muted">{u.title}</div> : null}
                    {u.id === admin.id ? <div className="text-xs font-semibold text-navy-700">You</div> : null}
                  </TD>
                  <TD>{u.email}</TD>
                  <TD>{roleLabel(u.role)}</TD>
                  <TD>{u.org_name ?? <span className="text-muted">Council Finance</span>}</TD>
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
