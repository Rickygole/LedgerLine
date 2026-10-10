export function InfoPage({
  title,
  updated,
  intro,
  children,
}: {
  title: string;
  updated: string;
  intro: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <article className="max-w-[820px] rounded border border-line bg-white px-5 py-8 sm:px-10 sm:py-10">
      <h1 className="text-[26px] font-extrabold leading-8 tracking-[-0.015em] text-ink sm:text-[32px] sm:leading-10">
        {title}
      </h1>
      <p className="mt-2 text-sm font-medium leading-5 text-muted">Last updated {updated}</p>
      <div className="mt-6 max-w-[70ch] text-lg leading-7 text-ink [&_p+p]:mt-3">{intro}</div>
      <div className="mt-2 max-w-[70ch] text-base leading-7 text-ink [&_a]:text-link [&_a]:underline [&_a]:underline-offset-2 [&_a:hover]:text-link-hover [&_h2]:mt-10 [&_h2]:scroll-mt-4 [&_h2]:border-t [&_h2]:border-line-soft [&_h2]:pt-7 [&_h2]:text-xl [&_h2]:font-bold [&_h2]:leading-7 [&_h3]:mt-6 [&_h3]:text-[17px] [&_h3]:font-bold [&_h3]:leading-6 [&_li]:mt-1.5 [&_ol]:mt-3 [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:mt-3 [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-6">
        {children}
      </div>
    </article>
  );
}
