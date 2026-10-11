"use client";

import { Printer } from "lucide-react";
import { Button } from "./button";

export function PrintButton({ label = "Print", size = "sm" }: { label?: string; size?: "sm" | "md" }) {
  return (
    <Button variant="secondary" size={size} onClick={() => window.print()}>
      <Printer className="h-4 w-4" aria-hidden="true" />
      {label}
    </Button>
  );
}
