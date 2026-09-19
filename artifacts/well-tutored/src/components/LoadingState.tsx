export function LoadingState({ message = "Loading..." }: { message?: string }) {
  return (
    <div className="flex-1 min-h-[420px] flex flex-col justify-center py-20 px-6" data-testid="loading-state">
      <div className="max-w-[1150px] w-full mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-[1fr_300px] gap-10 items-end mb-14">
          <div className="space-y-4">
            <div className="h-3 w-28 rounded-full skeleton-shimmer" />
            <div className="h-16 md:h-24 max-w-[580px] rounded skeleton-shimmer" />
            <div className="h-4 max-w-[500px] rounded skeleton-shimmer" />
            <div className="h-4 max-w-[420px] rounded skeleton-shimmer" />
          </div>
          <div className="hidden md:block h-28 border-l border-border pl-6">
            <div className="h-5 w-40 rounded skeleton-shimmer mb-3" />
            <div className="h-3 w-full rounded skeleton-shimmer mb-2" />
            <div className="h-3 w-4/5 rounded skeleton-shimmer" />
          </div>
        </div>
        <div className="editorial-rule mb-8" />
        <p className="text-muted-foreground text-[12px] uppercase tracking-[0.16em] font-semibold" data-testid="loading-message">{message}</p>
      </div>
    </div>
  );
}
