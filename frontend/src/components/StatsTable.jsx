// StatsTable — shared data table for the admin dashboard.
//
// Spec §Module 9 / line 3187 + 3204: "Row 3: StatsTable — Top 10 products
// | Top 10 vendors (tab toggle). Use shared StatsTable.jsx component
// where possible."
//
// Renders a column-driven table with built-in loading (skeleton rows)
// and empty states. Consumers declare:
//
//   <StatsTable
//     columns={[
//       { key: 'rank',    label: '#',          align: 'right' },
//       { key: 'name',    label: 'Product',
//         render: (row) => row.name,
//         sub:    (row) => row.email,         // optional 2nd line
//       },
//       { key: 'units',   label: 'Units sold', align: 'right',
//         render: (row) => fmtInt(row.quantity_sold) },
//       ...
//     ]}
//     rows={topProducts}
//     rowKey={(row) => row.product_id}
//     loading={topProductsQ.isLoading}
//     emptyTitle="No data yet"
//     emptyDescription="No products for this period."
//   />
import Skeleton from '@components/common/Skeleton';
import EmptyState from '@components/common/EmptyState';
import { cn } from '@/utils/cn';

/**
 * @param {Object} props
 * @param {Array<{
 *   key: string,
 *   label: string,
 *   align?: 'left'|'right'|'center',
 *   render?: (row, index) => React.ReactNode,
 *   sub?: (row) => React.ReactNode,
 * }>} props.columns
 * @param {Array} props.rows
 * @param {(row, index) => string|number} [props.rowKey]
 * @param {boolean} [props.loading]
 * @param {string} [props.emptyTitle]
 * @param {string} [props.emptyDescription]
 * @param {number} [props.skeletonRows=6]
 * @param {string} [props.className]
 */
const StatsTable = ({
  columns,
  rows,
  rowKey,
  loading = false,
  emptyTitle = 'No data yet',
  emptyDescription = 'There is nothing to display for this view.',
  skeletonRows = 6,
  className,
}) => {
  const alignClass = (align) =>
    align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left';

  if (loading) {
    return (
      <div className={cn('overflow-x-auto', className)}>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-surface-200 text-left text-xs uppercase tracking-wide text-text-secondary">
              {columns.map((c) => (
                <th key={c.key} className={cn('py-2 pr-2', alignClass(c.align))}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: skeletonRows }).map((_, i) => (
              <tr key={`sk-${i}`} className="border-b border-surface-100 last:border-0">
                {columns.map((c) => (
                  <td key={c.key} className={cn('py-2 pr-2', alignClass(c.align))}>
                    <Skeleton className="h-4 w-20" />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (!Array.isArray(rows) || rows.length === 0) {
    return (
      <EmptyState
        title={emptyTitle}
        description={emptyDescription}
        className={cn('py-10', className)}
      />
    );
  }

  return (
    <div className={cn('overflow-x-auto', className)}>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-surface-200 text-left text-xs uppercase tracking-wide text-text-secondary">
            {columns.map((c) => (
              <th key={c.key} className={cn('py-2 pr-2', alignClass(c.align))}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const key = rowKey ? rowKey(row, i) : row?.id ?? i;
            return (
              <tr key={key} className="border-b border-surface-100 last:border-0">
                {columns.map((c) => {
                  const value =
                    typeof c.render === 'function'
                      ? c.render(row, i)
                      : row?.[c.key];
                  const sub = typeof c.sub === 'function' ? c.sub(row) : null;
                  return (
                    <td key={c.key} className={cn('py-2 pr-2', alignClass(c.align))}>
                      {typeof value === 'string' || typeof value === 'number' ? (
                        <>
                          <span className="font-medium text-text-primary">{value}</span>
                          {sub && (
                            <span className="ml-2 text-xs text-text-secondary">{sub}</span>
                          )}
                        </>
                      ) : (
                        value
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default StatsTable;