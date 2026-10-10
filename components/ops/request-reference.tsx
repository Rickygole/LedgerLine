import { currentRequestId } from "@/lib/ops/request-id";

export async function RequestReference() {
  const id = await currentRequestId();
  if (!id) return null;
  return (
    <p className="mt-2 max-w-2xl text-xs text-muted">
      Request ID{" "}
      <span data-testid="request-id" className="font-mono text-ink">
        {id}
      </span>
      . Quote it if you contact support.
    </p>
  );
}
