import { HeaderSkeleton, LoadingRegion, TableSkeleton, TilesSkeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <LoadingRegion>
      <HeaderSkeleton crumbs={false} />
      <TilesSkeleton />
      <TableSkeleton />
    </LoadingRegion>
  );
}
