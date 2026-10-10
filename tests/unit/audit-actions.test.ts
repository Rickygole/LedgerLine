import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));

import { AUDIT_ACTIONS, ENTITY_LABELS, actionInWords, actionLabel } from "@/lib/finance/audit-actions";
import { auditPhrase, type AuditRow } from "@/lib/finance/admin/audit";

const ROOT = join(__dirname, "..", "..");

function files(dir: string, ext: RegExp): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...files(path, ext));
    else if (ext.test(name)) out.push(path);
  }
  return out;
}

function closeAt(source: string, open: number): number {
  let depth = 0;
  let quote: string | null = null;
  for (let i = open; i < source.length; i++) {
    const c = source[i];
    if (quote) {
      if (c === "\\") i++;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "`" || (c === "'" && /[\s(,=\[]/.test(source[i - 1] ?? " "))) quote = c;
    else if (c === "(" || c === "[" || c === "{") depth++;
    else if (c === ")" || c === "]" || c === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return source.length;
}

function topLevel(list: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let current = "";
  for (let i = 0; i < list.length; i++) {
    const c = list[i];
    if (quote) {
      current += c;
      if (c === "\\") current += list[++i] ?? "";
      else if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") quote = c;
    if (c === "(" || c === "[" || c === "{") depth++;
    if (c === ")" || c === "]" || c === "}") depth--;
    if (c === "," && depth === 0) {
      parts.push(current.trim());
      current = "";
    } else current += c;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

function sqlArgs(source: string, at: number): string[] {
  const open = source.indexOf("(", at);
  let depth = 0;
  let end = open;
  for (; end < source.length; end++) {
    if (source[end] === "(") depth++;
    if (source[end] === ")") {
      depth--;
      if (depth === 0) break;
    }
  }
  return topLevel(source.slice(open + 1, end));
}

function literals(expression: string, quote: string): string[] {
  const pattern = quote === "'" ? /'([a-z_]+)'/g : /"([a-z_]+)"/g;
  return [...expression.matchAll(pattern)].map((m) => m[1]);
}

function emittedActions(): { actions: Set<string>; entities: Set<string> } {
  const actions = new Set<string>();
  const entities = new Set<string>();
  const sqlFiles = files(join(ROOT, "db", "migrations"), /\.sql$/);
  const codeFiles = ["app", "lib", "scripts"].flatMap((dir) => files(join(ROOT, dir), /\.tsx?$/));

  for (const file of sqlFiles) {
    const sql = readFileSync(file, "utf8");
    for (const m of sql.matchAll(/PERFORM app\.write_audit\(/g)) {
      const args = sqlArgs(sql, m.index!);
      literals(args[0], "'").forEach((e) => entities.add(e));
      const action = args[2];
      if (/^'[a-z_]+'$/.test(action)) actions.add(action.slice(1, -1));
      else if (/^'([a-z_]+)'\s*\|\|\s*v_planned\.action$/.test(action)) {
        const prefix = action.match(/^'([a-z_]+)'/)![1];
        for (const kind of sql.matchAll(/rp\.action IN \(([^)]*)\)/g)) for (const k of literals(kind[1], "'")) if (k !== "retire") actions.add(`${prefix}${k}`);
      } else if (/^CASE WHEN [^']+THEN '[a-z_]+' ELSE '[a-z_]+' END$/.test(action)) {
        literals(action, "'").forEach((a) => actions.add(a));
      } else if (action === "p_action") {
        for (const p of sql.matchAll(/p_action = '([a-z_]+)'/g)) actions.add(p[1]);
      } else throw new Error(`Unrecognized audit action expression ${action} in ${file}`);
    }
    for (const m of sql.matchAll(/INSERT INTO audit_event \(actor_id, entity, entity_id, action[^)]*\)\s*VALUES \(/g)) {
      const args = sqlArgs(sql, m.index! + m[0].length - 1);
      if (/^'[a-z_]+'$/.test(args[1])) entities.add(args[1].slice(1, -1));
      if (/^'[a-z_]+'$/.test(args[3])) actions.add(args[3].slice(1, -1));
    }
  }

  for (const file of codeFiles) {
    const code = readFileSync(file, "utf8");
    for (const m of code.matchAll(/write_audit\(/g)) {
      const queryAt = code.lastIndexOf("query(", m.index!);
      const call = code.slice(queryAt + 5, closeAt(code, queryAt + 5) + 1);
      const [sqlText, params = "[]"] = topLevel(call.slice(1, -1));
      const args = sqlArgs(sqlText, sqlText.indexOf("write_audit("));
      const values = topLevel(params.trim().slice(1, -1));
      const resolve = (arg: string) => {
        if (/^'[a-z_]+'$/.test(arg)) return [arg.slice(1, -1)];
        const n = arg.match(/^\$(\d+)$/);
        if (!n) return [];
        const value = values[Number(n[1]) - 1] ?? "";
        return literals(value.includes("?") ? value.slice(value.indexOf("?") + 1) : value, '"');
      };
      resolve(args[0]).forEach((e) => entities.add(e));
      const found = resolve(args[2]);
      if (found.length === 0) throw new Error(`Could not read the audit action in ${file}: ${args[2]}`);
      found.forEach((a) => actions.add(a));
    }
    if (file.endsWith("seed.ts")) for (const m of code.matchAll(/\baction: "([a-z_]+)"/g)) actions.add(m[1]);
  }
  return { actions, entities };
}

describe("audit action vocabulary", () => {
  const { actions, entities } = emittedActions();

  it("finds the actions the database and the app write", () => {
    for (const known of ["submit", "accept", "reopen", "correction", "export", "form_edit", "user_create", "role_change", "password_set", "reminders_queued", "rollover_carry", "rollover_rename", "rollover_retire", "sign_in", "attachment_removed", "flag_resolve", "flag_dismiss", "activate", "deactivate", "delete"]) {
      expect(actions, `scanner missed ${known}`).toContain(known);
    }
  });

  it("has a label and a phrase for every action that can be written", () => {
    const missing = [...actions].filter((action) => !AUDIT_ACTIONS[action]);
    expect(missing, `add these actions to lib/finance/audit-actions.ts: ${missing.join(", ")}`).toEqual([]);
  });

  it("has a label for every entity that can be written", () => {
    const missing = [...entities].filter((entity) => !ENTITY_LABELS[entity]);
    expect(missing, `add these entities to ENTITY_LABELS: ${missing.join(", ")}`).toEqual([]);
  });

  it("never shows a raw action string", () => {
    for (const action of Object.keys(AUDIT_ACTIONS)) {
      expect(actionLabel(action)).not.toMatch(/_/);
      expect(actionInWords(action)).not.toMatch(/_/);
    }
  });

  const row = (over: Partial<AuditRow>): AuditRow => ({
    id: "1",
    at: "2026-10-09T14:00:00Z",
    actor_id: "a",
    actor_name: "Priya Raman",
    entity: "submission",
    entity_id: "x",
    action: "submit",
    note: null,
    before: null,
    after: null,
    ai_action_id: null,
    label: null,
    org_name: null,
    full_count: 1,
    ...over,
  });

  it("words account and export events as plain sentences", () => {
    const created = auditPhrase(row({ entity: "app_user", action: "user_create", label: "Jordan Lee" }));
    expect(`${created.actor} ${created.verb} ${created.subject}`).toBe("Priya Raman created an account for Jordan Lee");
    const exported = auditPhrase(row({ entity: "export", entity_id: "FY26-YE", action: "export", after: { rows: 357 } }));
    expect(`${exported.actor} ${exported.verb} ${exported.subject}`).toBe("Priya Raman exported FY26-YE submissions (357 rows)");
    const queued = auditPhrase(row({ entity: "reporting_period", entity_id: "FY26-YE", action: "reminders_queued" }));
    expect(`${queued.verb} ${queued.subject}`).toBe("queued reminders for FY26-YE");
  });

  it("never falls back to recorded wording for a known pair", () => {
    for (const action of actions) {
      for (const entity of entities) {
        const phrase = auditPhrase(row({ entity, action, label: "Thing" }));
        expect(phrase.verb).not.toMatch(/^recorded /);
        expect(`${phrase.verb} ${phrase.subject}`).not.toMatch(/_/);
      }
    }
  });
});
