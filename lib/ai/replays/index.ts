import type { ProposedField } from "@/lib/forms/editor/draft-core";
import r0 from "./f5a6776c5247fb5177a83281a6514d6abf160841e21135fe7b9b3b4059b9ad5d.json";
import r1 from "./acc91d2b0686b7919d038c43e55c2819d95861b4a8d486c5c8e0717ab1915110.json";
import r2 from "./897fe549cb808c12ef07db14e1212b883851c9502de45a742c8291d274a2cf59.json";

export type ReplayRecord = { template: string; note: string; output: { questions: ProposedField[] } };

export const REPLAYS: Record<string, ReplayRecord> = {
  "f5a6776c5247fb5177a83281a6514d6abf160841e21135fe7b9b3b4059b9ad5d": r0 as ReplayRecord,
  "acc91d2b0686b7919d038c43e55c2819d95861b4a8d486c5c8e0717ab1915110": r1 as ReplayRecord,
  "897fe549cb808c12ef07db14e1212b883851c9502de45a742c8291d274a2cf59": r2 as ReplayRecord,
};
