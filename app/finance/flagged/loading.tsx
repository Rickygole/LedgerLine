import { HeaderSkeleton, LoadingRegion, TableSkeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <LoadingRegion>
      <HeaderSkeleton action />
      <div className="mb-6 h-[4.5rem] rounded-xl border border-line bg-white shadow-card" aria-hidden="true" />
      <TableSkeleton rows={8} columns={6} />
    </LoadingRegion>
  );
}
