export function NoValue({ label = "Not entered" }: { label?: string }) {
  return (
    <span className="text-muted">
      <span aria-hidden="true">-</span>
      <span className="sr-only">{label}</span>
    </span>
  );
}
