
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="mx-auto max-w-[1140px] px-4 py-8 w-full space-y-8">
      <div className="space-y-2">
        <Skeleton className="h-8 w-1/3" />
        <Skeleton className="h-6 w-1/2" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    </div>
  );
}
