export type FormState = { error?: string; fieldErrors?: Record<string, string>; values?: Record<string, string> } | undefined;

export const AGENCIES = ["DYCD", "DCLA", "DFTA", "DOE", "DOHMH", "DPR", "HRA", "SBS"] as const;
