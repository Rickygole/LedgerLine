export type FormState = { error?: string; fieldErrors?: Record<string, string> } | undefined;

export const AGENCIES = ["ACS", "DCLA", "DCWP", "DFTA", "DHS", "DOE", "DOHMH", "DOP", "DPR", "DYCD", "HPD", "HRA", "MOCJ", "MOIA", "SBS"] as const;
