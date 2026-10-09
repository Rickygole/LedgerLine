import Link from "next/link";
import { Bot } from "lucide-react";
import { Badge } from "@/components/ui/status-badge";
import { getCurrentUser } from "@/lib/auth";
import { auditEntityHref, auditPhrase, type AuditRow } from "@/lib/finance/admin/audit";

export async function AuditSentence({ row }: { row: AuditRow }) {
  const phrase = auditPhrase(row);
  const viewer = await getCurrentUser();
  const href = row.entity === "app_user" && viewer?.role !== "finance_admin" ? null : auditEntityHref(row);
  const subject = href && phrase.subject ? (
    <Link href={href} className="font-semibold text-link underline underline-offset-2 hover:text-link-hover">
      {phrase.subject}
    </Link>
  ) : (
    <span className="font-semibold">{phrase.subject}</span>
  );
  return (
    <span>
      <span className="font-semibold">{phrase.actor}</span> {phrase.verb} {subject}
      {row.ai_action_id ? (
        <span className="ml-2 align-middle">
          <Badge tone="info" icon={Bot}>
            AI assisted
          </Badge>
        </span>
      ) : null}
    </span>
  );
}
