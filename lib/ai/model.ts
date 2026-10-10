import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { createHash } from "node:crypto";
import type { Tx } from "@/lib/db";

type AiFeature = "form_draft" | "return_note";
export type AiMode = "live" | "replay" | "fallback";

export function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

type AiProvider = "anthropic" | "ollama";

function providerName(): AiProvider {
  return process.env.AI_PROVIDER === "ollama" ? "ollama" : "anthropic";
}

function modelFor(feature: AiFeature): string | null {
  const model = feature === "form_draft" ? process.env.AI_MODEL_FORM : process.env.AI_MODEL_NOTE;
  if (!model) return null;
  if (providerName() === "ollama") return model;
  return process.env.ANTHROPIC_API_KEY ? model : null;
}

function timeoutFor(call: StructuredCall): number {
  const factor = Number(process.env.AI_TIMEOUT_FACTOR);
  return Number.isFinite(factor) && factor > 0 ? Math.round(call.timeoutMs * factor) : call.timeoutMs;
}

const PRICES: Record<string, { input: number; output: number }> = {};

function priceFor(model: string) {
  const configured = process.env.AI_PRICE_PER_MTOK;
  if (configured) {
    const [input, output] = configured.split("/").map(Number);
    if (Number.isFinite(input) && Number.isFinite(output)) return { input, output };
  }
  return PRICES[model] ?? { input: 0, output: 0 };
}

type StructuredCall = {
  feature: AiFeature;
  system: string;
  user: string;
  schema: Record<string, unknown>;
  maxTokens: number;
  timeoutMs: number;
};

type StructuredResult = {
  output: unknown;
  model: string;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  latencyMs: number;
};

type OllamaChat = {
  message?: { content?: string };
  done_reason?: string;
  prompt_eval_count?: number;
  eval_count?: number;
};

async function callOllama(call: StructuredCall, model: string): Promise<StructuredResult | null> {
  const base = (process.env.OLLAMA_URL || "http://127.0.0.1:11434").replace(/\/+$/, "");
  const started = Date.now();
  const response = await fetch(`${base}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    signal: AbortSignal.timeout(timeoutFor(call)),
    body: JSON.stringify({
      model,
      stream: false,
      think: false,
      format: call.schema,
      options: { temperature: 0, num_predict: call.maxTokens },
      messages: [
        { role: "system", content: call.system },
        { role: "user", content: call.user },
      ],
    }),
  });
  if (!response.ok) throw new Error(`local model returned ${response.status}`);
  const body = (await response.json()) as OllamaChat;
  if (body.done_reason === "length") throw new Error("local model output was cut off");
  const output = JSON.parse(body.message?.content ?? "");
  return {
    output,
    model: `${model} (local)`,
    tokensIn: body.prompt_eval_count ?? 0,
    tokensOut: body.eval_count ?? 0,
    costUsd: 0,
    latencyMs: Date.now() - started,
  };
}

export async function callStructured(call: StructuredCall): Promise<StructuredResult | null> {
  const model = modelFor(call.feature);
  if (!model) return null;
  if (providerName() === "ollama") return callOllama(call, model);
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: timeoutFor(call), maxRetries: 1 });
  const started = Date.now();
  const response = await client.messages.create({
    model,
    max_tokens: call.maxTokens,
    system: call.system,
    messages: [{ role: "user", content: call.user }],
    output_config: { format: { type: "json_schema", schema: call.schema } },
  } as unknown as Anthropic.MessageCreateParamsNonStreaming);
  if (response.stop_reason === "refusal") return null;
  const text = response.content.map((block) => (block.type === "text" ? block.text : "")).join("");
  const output = JSON.parse(text);
  const price = priceFor(model);
  return {
    output,
    model,
    tokensIn: response.usage.input_tokens,
    tokensOut: response.usage.output_tokens,
    costUsd: (response.usage.input_tokens * price.input + response.usage.output_tokens * price.output) / 1_000_000,
    latencyMs: Date.now() - started,
  };
}

export async function logAiAction(
  tx: Tx,
  row: {
    feature: AiFeature;
    mode: AiMode;
    model: string | null;
    promptVersion: string;
    inputSha256: string;
    output: unknown;
    validation: unknown;
    tokensIn?: number;
    tokensOut?: number;
    costUsd?: number;
    latencyMs?: number;
    submissionId?: string | null;
    initiativeId?: string | null;
  }
): Promise<string> {
  const inserted = await tx.one<{ id: string }>(
    `INSERT INTO ai_action (feature, mode, model, prompt_version, input_sha256, output, validation, tokens_in, tokens_out, cost_usd, latency_ms, submission_id, initiative_id, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, app.uid())
     RETURNING id`,
    [
      row.feature,
      row.mode,
      row.model,
      row.promptVersion,
      row.inputSha256,
      JSON.stringify(row.output),
      JSON.stringify(row.validation),
      row.tokensIn ?? null,
      row.tokensOut ?? null,
      row.costUsd ?? null,
      row.latencyMs ?? null,
      row.submissionId ?? null,
      row.initiativeId ?? null,
    ]
  );
  if (!inserted) throw new Error("could not log ai action");
  return inserted.id;
}

export async function aiEnabled(tx: Tx): Promise<boolean> {
  const row = await tx.one<{ value: boolean }>("SELECT value FROM app_setting WHERE key = 'ai_enabled'");
  return row?.value !== false;
}
