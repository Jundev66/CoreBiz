import { getTranslations } from 'next-intl/server';

/**
 * What a screen looks like before its data arrives.
 *
 * Rendered by each module's `loading.tsx`, which Next prefetches along with the link: the
 * moment someone clicks "Products", this replaces the old page inside the frame, and the
 * real content streams in over it. Before it existed a click changed nothing on screen until
 * the server had finished, which is exactly what reads as "slow".
 *
 * It mirrors the shapes of the real screens — a title, then a table, a card or a grid of
 * figures — so the content does not jump when it lands. Nothing in it is a landmark, a
 * heading or a live region: assistive technology hears one "loading" and then the page.
 */

export type SkeletonVariant = 'dashboard' | 'list' | 'detail' | 'form';

export async function ScreenSkeleton({ variant }: { variant: SkeletonVariant }) {
  const t = await getTranslations();

  return (
    <div aria-busy="true" className="animate-pulse motion-reduce:animate-none">
      <span className="sr-only">{t('common.loading')}</span>

      <div aria-hidden="true">
        <div className="mb-6 sm:mb-8">
          <Bar className="h-8 w-56" />
          <Bar className="mt-2 h-4 w-80" />
        </div>

        {variant === 'dashboard' && <DashboardShape />}
        {variant === 'list' && <ListShape />}
        {variant === 'detail' && <DetailShape />}
        {variant === 'form' && <FormShape />}
      </div>
    </div>
  );
}

function Bar({ className }: { className: string }) {
  return <div className={`max-w-full rounded-control bg-subtle ${className}`} />;
}

function Panel({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-card border border-line bg-surface shadow-xs ${className}`}>
      {children}
    </div>
  );
}

function DashboardShape() {
  return (
    <>
      <div className="mb-8 grid grid-cols-2 gap-3 sm:gap-4 lg:mb-10 lg:grid-cols-4">
        {[0, 1, 2, 3].map((key) => (
          <Panel key={key} className="p-4 sm:p-5">
            <Bar className="h-3.5 w-24" />
            <Bar className="mt-3 h-7 w-28" />
          </Panel>
        ))}
      </div>
      <div className="grid gap-8 lg:grid-cols-2">
        <Rows count={5} />
        <Rows count={5} />
      </div>
    </>
  );
}

function ListShape() {
  return (
    <div className="space-y-4">
      <Bar className="h-9 w-40" />
      <Rows count={8} />
    </div>
  );
}

function DetailShape() {
  return (
    <div className="space-y-8">
      <Panel className="grid gap-x-8 gap-y-5 p-5 sm:grid-cols-3 sm:p-6">
        {[0, 1, 2, 3, 4, 5].map((key) => (
          <div key={key}>
            <Bar className="h-3 w-20" />
            <Bar className="mt-2 h-5 w-36" />
          </div>
        ))}
      </Panel>
      <Rows count={4} />
    </div>
  );
}

function FormShape() {
  return (
    <Panel className="max-w-2xl space-y-5 p-5 sm:p-6">
      {[0, 1, 2, 3].map((key) => (
        <div key={key}>
          <Bar className="h-3.5 w-28" />
          <Bar className="mt-2 h-10 w-full" />
        </div>
      ))}
      <Bar className="h-10 w-32" />
    </Panel>
  );
}

function Rows({ count }: { count: number }) {
  return (
    <Panel className="divide-y divide-line">
      {Array.from({ length: count }, (_, key) => (
        <div key={key} className="flex items-center gap-4 px-4 py-3.5">
          <Bar className="h-4 w-24" />
          <Bar className="h-4 flex-1" />
          <Bar className="h-4 w-16" />
        </div>
      ))}
    </Panel>
  );
}
