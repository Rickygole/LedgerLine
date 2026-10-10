import type { Tx } from "@/lib/db";
import type { Role } from "@/lib/auth";
import { PAGE_SIZE, likePattern } from "./params";

type UserRow = {
  id: string;
  email: string;
  full_name: string;
  title: string | null;
  role: Role;
  org_id: string | null;
  org_name: string | null;
  can_sign_in: boolean;
  active: boolean;
  full_count: number;
};

export const STAFF_ROLES = ["finance_viewer", "finance_analyst", "finance_admin"] as const;

export async function listUsers(tx: Tx, filters: { q: string; role: string; page: number }) {
  const rows = await tx.query<UserRow>(
    `SELECT u.id, u.email, u.full_name, u.title, u.role, u.org_id, o.legal_name AS org_name, u.can_sign_in, u.active, count(*) OVER ()::int AS full_count
     FROM app_user u LEFT JOIN organization o ON o.id = u.org_id
     WHERE u.email <> 'system.scheduler@ledgerline.example'
       AND ($1 = '' OR u.full_name ILIKE $2 OR u.email ILIKE $2 OR o.legal_name ILIKE $2)
       AND ($3 = '' OR u.role = $3)
     ORDER BY (u.role = 'cbo_submitter'), u.can_sign_in DESC, u.full_name
     LIMIT ${PAGE_SIZE} OFFSET $4`,
    [filters.q, likePattern(filters.q), filters.role, (filters.page - 1) * PAGE_SIZE],
  );
  return { rows, total: rows[0]?.full_count ?? 0 };
}
