import { withClaims, type Tx } from "@/lib/db";
import { sendEmail, transportFrom, type OutgoingEmail, type SendResult, type Transport } from "@/lib/email";

export type Claimed = { id: string; to_email: string; template: string; subject: string; body_text: string; attempts: number };

export type OutboxStore = {
  claim(submissionId: string | null, limit: number): Promise<Claimed[]>;
  finish(id: string, status: "sent" | "failed" | "held" | "recorded", providerId: string | null, reason: string | null): Promise<string | null>;
};

type DispatchSummary = Record<"sent" | "held" | "recorded" | "retry" | "failed", number>;

const NEVER_EMAILED = new Set(["password_reset", "password_set"]);

export async function dispatch(
  store: OutboxStore,
  transport: Transport | null,
  options: { submissionId?: string | null; limit?: number; send?: (transport: Transport, message: OutgoingEmail) => Promise<SendResult> } = {}
): Promise<DispatchSummary> {
  const summary: DispatchSummary = { sent: 0, held: 0, recorded: 0, retry: 0, failed: 0 };
  const send = options.send ?? ((t, m) => sendEmail(t, m));
  const rows = await store.claim(options.submissionId ?? null, options.limit ?? 25);
  for (const row of rows) {
    if (!transport || NEVER_EMAILED.has(row.template)) {
      await store.finish(row.id, "recorded", null, null);
      summary.recorded += 1;
      continue;
    }
    const result = await send(transport, { to: row.to_email, subject: row.subject, text: row.body_text }).catch(
      (error: unknown): SendResult => ({ status: "failed", reason: error instanceof Error ? error.message : "Delivery failed" })
    );
    if (result.status === "sent") {
      await store.finish(row.id, "sent", result.providerId, null);
      summary.sent += 1;
    } else if (result.status === "held") {
      await store.finish(row.id, "held", null, null);
      summary.held += 1;
    } else {
      const next = await store.finish(row.id, "failed", null, result.reason);
      summary[next === "queued" ? "retry" : "failed"] += 1;
    }
  }
  return summary;
}

function dbStore(tx: Tx): OutboxStore {
  return {
    claim: (submissionId, limit) =>
      tx.query<Claimed>("SELECT id, to_email, template, subject, body_text, attempts FROM app.claim_outbox($1, $2)", [submissionId, limit]),
    async finish(id, status, providerId, reason) {
      const row = await tx.one<{ next: string | null }>("SELECT app.finish_outbox($1, $2, $3, $4) AS next", [id, status, providerId, reason]);
      return row?.next ?? null;
    },
  };
}

export async function dispatchFor(userId: string, options: { submissionId?: string | null; limit?: number; rounds?: number } = {}): Promise<DispatchSummary | null> {
  const transport = transportFrom();
  const limit = Math.min(options.limit ?? 25, 100);
  const total: DispatchSummary = { sent: 0, held: 0, recorded: 0, retry: 0, failed: 0 };
  try {
    for (let round = 0; round < (options.rounds ?? 1); round += 1) {
      const claimed = await withClaims(userId, (tx) => dbStore(tx).claim(options.submissionId ?? null, limit));
      const store: OutboxStore = {
        claim: async () => claimed,
        finish: (id, status, providerId, reason) => withClaims(userId, (tx) => dbStore(tx).finish(id, status, providerId, reason)),
      };
      const summary = await dispatch(store, transport, { submissionId: options.submissionId, limit });
      for (const key of Object.keys(total) as (keyof DispatchSummary)[]) total[key] += summary[key];
      if (claimed.length < limit) break;
    }
    return total;
  } catch (error) {
    console.error("outbox dispatch failed", error);
    return null;
  }
}
