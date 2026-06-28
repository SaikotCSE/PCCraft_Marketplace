// StockBadge — green "In Stock", yellow "Low Stock (N left)", red "Out of Stock".
//
// Per spec §2.7 / §1.2. Accepts either the API enum (`stock_status`) or
// just a numeric stock_quantity.
import { STOCK_STATUS } from '@/utils/constants';

const styles = {
  IN_STOCK: 'bg-success/15 text-success',
  LOW_STOCK: 'bg-warning/15 text-warning',
  OUT_OF_STOCK: 'bg-danger/15 text-danger',
};

const StockBadge = ({ stock_status, stock_quantity = 0, className = '' }) => {
  let status = stock_status;
  if (!status) {
    if (stock_quantity <= 0) status = STOCK_STATUS.OUT_OF_STOCK;
    else if (stock_quantity <= 5) status = STOCK_STATUS.LOW_STOCK;
    else status = STOCK_STATUS.IN_STOCK;
  }
  const cls = styles[status] || styles.IN_STOCK;

  let label;
  switch (status) {
    case STOCK_STATUS.OUT_OF_STOCK:
      label = 'Out of stock';
      break;
    case STOCK_STATUS.LOW_STOCK:
      label = `Low stock · ${stock_quantity} left`;
      break;
    default:
      label = 'In stock';
  }

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${cls} ${className}`}
    >
      <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-current" />
      {label}
    </span>
  );
};

export default StockBadge;