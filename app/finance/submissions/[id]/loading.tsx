import { CardSkeleton, HeaderSkeleton, LoadingRegion } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <LoadingRegion label="Loading report">
      <HeaderSkeleton />
      <div className="grid gap-6 lg:grid-cols-12">
        <div className="space-y-6 lg:col-span-8">
          <CardSkeleton lines={6} />
          <CardSkeleton lines={5} />
        </div>
        <div className="space-y-6 lg:col-span-4">
          <CardSkeleton lines={3} />
          <CardSkeleton lines={5} />
        </div>
      </div>
    </LoadingRegion>
  );
}
