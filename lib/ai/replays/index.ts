import type { ProposedField } from "@/lib/forms/editor/draft-core";
import r0 from "./4f7e7f8b47f4acd3ab8d7ff7aab6b041641b316ff11f111b3fcc62474cbb1f62.json";
import r1 from "./e1382396bd16a35a4e1299e88cbc1cbd91c7d1e134a9db6f4b6a687286dec65b.json";
import r2 from "./b8e6e89406ef0aedbde6f9fbf6d0cb310ae7271aff9848fefe2b5fc44e476d73.json";

export type ReplayRecord = { template: string; note: string; output: { questions: ProposedField[] } };

export const REPLAYS: Record<string, ReplayRecord> = {
  "4f7e7f8b47f4acd3ab8d7ff7aab6b041641b316ff11f111b3fcc62474cbb1f62": r0 as ReplayRecord,
  "e1382396bd16a35a4e1299e88cbc1cbd91c7d1e134a9db6f4b6a687286dec65b": r1 as ReplayRecord,
  "b8e6e89406ef0aedbde6f9fbf6d0cb310ae7271aff9848fefe2b5fc44e476d73": r2 as ReplayRecord,
};
