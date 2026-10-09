import { Bone, CardSkeleton, HeaderSkeleton, LoadingRegion } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <LoadingRegion label="Loading report">
      <HeaderSkeleton />
      <div className="grid gap-6 lg:grid-cols-[14rem_minmax(0,1fr)]">
        <div className="hidden space-y-3 lg:block">
          {Array.from({ length: 6 }, (_, i) => (
            <Bone key={i} className="h-4 w-40" />
          ))}
        </div>
        <div className="space-y-6">
          <CardSkeleton lines={5} />
          <CardSkeleton lines={6} />
        </div>
      </div>
    </LoadingRegion>
  );
}
