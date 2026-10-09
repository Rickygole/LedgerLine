import { CardSkeleton, HeaderSkeleton, LoadingRegion, TableSkeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <LoadingRegion>
      <HeaderSkeleton />
      <CardSkeleton lines={3} className="mb-6" />
      <TableSkeleton rows={4} columns={4} />
    </LoadingRegion>
  );
}
