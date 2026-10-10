import { PageHeader } from "@/components/ui/page-header";

export function NoPeriods({ title }: { title: string }) {
  return (
    <>
      <PageHeader title={title} crumbs={[{ label: "Dashboard", href: "/finance" }, { label: title }]} />
      <p className="max-w-[70ch] rounded border border-line bg-white px-5 py-8 text-[15px] text-muted">
        No reporting periods are set up yet. A Finance administrator can add them from Initiatives.
      </p>
    </>
  );
}
