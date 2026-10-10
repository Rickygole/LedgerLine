import { GEO_BINS } from "@/components/ui/status-colors";

export const GEO_FILL = GEO_BINS.map((bin) => bin.color);

export const GEO_BIN_LABEL = GEO_BINS.map((bin) => (bin.max === 0 ? "None" : bin.label));

export const MAP_INK = "#1b2433";

export const MAP_ACTION = "#005ea2";
