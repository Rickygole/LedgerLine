import { Download } from "lucide-react";
import { buttonClass } from "@/components/ui/button";

export function DownloadPdfLink({ href, variant = "secondary" }: { href: string; variant?: "secondary" | "ghost" }) {
  return (
    <a href={href} download className={buttonClass(variant, "md", "no-print")}>
      <Download className="h-4 w-4" aria-hidden="true" />
      Download PDF
    </a>
  );
}
