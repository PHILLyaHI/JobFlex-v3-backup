import * as React from "react";

/**
 * Client-side pagination for an already-filtered list. Slices `items` into
 * pages of `pageSize` and resets to page 1 whenever the source list identity
 * changes (e.g. a status filter or search narrows it) so you never land on a
 * now-empty page. `page` is clamped to the valid range on every render.
 *
 * Pass a memoized `items` (a `useMemo`d filtered array) so the reset only fires
 * on real filter changes, not on every render.
 */
export function usePagedList<T>(items: T[], pageSize = 20) {
  const [page, setPage] = React.useState(1);

  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));

  React.useEffect(() => {
    setPage(1);
  }, [items]);

  const safePage = Math.min(page, pageCount);
  const offset = (safePage - 1) * pageSize;

  const pageItems = React.useMemo(
    () => items.slice(offset, offset + pageSize),
    [items, offset, pageSize],
  );

  return { page: safePage, pageCount, setPage, pageItems, offset };
}
