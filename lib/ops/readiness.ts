import type { Tx } from "@/lib/db";

export type TrainingModule = { key: string; title: string; audience: string[] };

export function requiredModules(modules: TrainingModule[], role: string): TrainingModule[] {
  return modules.filter((m) => m.audience.includes(role));
}

export function percent(part: number, whole: number): number | null {
  if (whole === 0) return null;
  return Math.round((part / whole) * 100);
}

type UatEntry = { scenario: string; session_on: string; recorded_at: string; result: string };

export function latestPerScenario(entries: UatEntry[]): UatEntry[] {
  const latest = new Map<string, UatEntry>();
  for (const entry of entries) {
    const current = latest.get(entry.scenario);
    if (
      !current ||
      entry.session_on > current.session_on ||
      (entry.session_on === current.session_on && entry.recorded_at > current.recorded_at)
    )
      latest.set(entry.scenario, entry);
  }
  return [...latest.values()];
}

export function passRate(entries: UatEntry[]): { scenarios: number; passed: number; percent: number | null } {
  const latest = latestPerScenario(entries);
  const passed = latest.filter((e) => e.result === "passed").length;
  return { scenarios: latest.length, passed, percent: percent(passed, latest.length) };
}

export function trainedShare(
  users: { id: string; role: string }[],
  modules: TrainingModule[],
  records: { user_id: string; module_key: string }[],
): { users: number; trained: number; percent: number | null } {
  const done = new Map<string, Set<string>>();
  for (const record of records) {
    const set = done.get(record.user_id) ?? new Set<string>();
    set.add(record.module_key);
    done.set(record.user_id, set);
  }
  const trained = users.filter((user) =>
    requiredModules(modules, user.role).every((m) => done.get(user.id)?.has(m.key)),
  ).length;
  return { users: users.length, trained, percent: percent(trained, users.length) };
}

type UatSession = {
  id: string;
  session_on: string;
  scenario: string;
  tester_name: string;
  tester_role: string;
  result: string;
  notes: string | null;
  recorded_at: string;
};
type UatDefect = {
  id: string;
  session_id: string;
  description: string;
  severity: string;
  status: string;
  fixed_on: string | null;
};

export async function loadReadiness(tx: Tx) {
  const modules = await tx.query<TrainingModule>("SELECT key, title, audience FROM training_module ORDER BY position");
  const users = await tx.query<{ id: string; full_name: string; role: string; email: string }>(
    "SELECT id, full_name, role, email FROM app_user WHERE role <> 'cbo_submitter' AND active AND email <> 'system.scheduler@ledgerline.example' ORDER BY full_name",
  );
  const records = await tx.query<{ user_id: string; module_key: string; completed_on: string }>(
    "SELECT user_id, module_key, completed_on::text AS completed_on FROM training_record",
  );
  const sessions = await tx.query<UatSession>(
    "SELECT id, session_on::text AS session_on, scenario, tester_name, tester_role, result, notes, recorded_at::text AS recorded_at FROM uat_session ORDER BY session_on DESC, recorded_at DESC",
  );
  const defects = await tx.query<UatDefect>(
    "SELECT id, session_id, description, severity, status, fixed_on::text AS fixed_on FROM uat_defect ORDER BY created_at, id",
  );
  return {
    modules,
    users,
    records,
    sessions,
    defects,
    training: trainedShare(users, modules, records),
    uat: passRate(sessions),
    openDefects: defects.filter((d) => d.status === "open").length,
  };
}
