// Skeleton — pulse-animated placeholder block.
//
// Per spec §1.2 / §2.7 the catalog grid shows 8 of these while
// productService.list() is in-flight.
//
//   <Skeleton className="h-40 w-full" />
//
const Skeleton = ({ className = '', rounded = 'rounded-md' }) => (
  <div
    aria-hidden="true"
    className={`animate-pulse bg-surface-200 ${rounded} ${className}`}
  />
);

export default Skeleton;