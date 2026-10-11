import { z } from "zod";
import { FIELD_TYPES } from "@/lib/forms/editor/definition";

const sumTarget = z.union([z.number(), z.literal("award")]);

export const questionSchema = z.object({
  key: z.string(),
  label: z.string(),
  help: z.string().optional(),
  type: z.enum(FIELD_TYPES),
  required: z.boolean(),
  scope: z.enum(["standard", "initiative"]),
  options: z.array(z.string()).optional(),
  maxLength: z.number().optional(),
  maxWords: z.number().optional(),
  visibleWhen: z.object({ key: z.string(), equals: z.string() }).optional(),
  columns: z
    .array(
      z.object({
        key: z.string(),
        label: z.string(),
        type: z.enum(["text", "number", "integer", "currency", "percent"]),
      }),
    )
    .optional(),
  maxRows: z.number().optional(),
  sumRule: z.object({ column: z.string(), target: sumTarget }).optional(),
  citation: z.object({ quote: z.string(), paragraph: z.number() }).optional(),
});

export const definitionSchema = z.object({
  title: z.string(),
  sections: z.array(
    z.object({
      key: z.string(),
      title: z.string(),
      description: z.string().optional(),
      kind: z.enum(["questions", "budget"]),
      questions: z.array(questionSchema),
    }),
  ),
  sumRules: z.array(z.object({ key: z.string(), fields: z.array(z.string()), target: sumTarget })).optional(),
  budget: z.object({ enabled: z.boolean(), mustEqualAward: z.boolean(), maxLines: z.number() }),
});
