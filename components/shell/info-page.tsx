export function InfoPage({ title, updated, intro, children }: { title: string; updated: string; intro: React.ReactNode; children: React.ReactNode }) {
  return (
    <article className="max-w-3xl rounded border border-line bg-white px-5 py-7 sm:px-10 sm:py-9">
      <h1 className="text-[1.75rem] font-bold leading-9 text-ink">{title}</h1>
      <p className="mt-1 text-sm text-muted">Last updated {updated}</p>
      <div className="mt-5 text-lg leading-8 text-ink">{intro}</div>
      <div className="mt-2 text-base leading-7 text-ink [&_a]:text-link [&_a]:underline [&_a]:underline-offset-2 [&_a:hover]:text-link-hover [&_h2]:mt-9 [&_h2]:scroll-mt-4 [&_h2]:border-t [&_h2]:border-line [&_h2]:pt-6 [&_h2]:text-xl [&_h2]:font-bold [&_h2]:leading-7 [&_h3]:mt-6 [&_h3]:text-base [&_h3]:font-bold [&_li]:mt-1.5 [&_ol]:mt-3 [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:mt-3 [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-6">
        {children}
      </div>
    </article>
  );
}
