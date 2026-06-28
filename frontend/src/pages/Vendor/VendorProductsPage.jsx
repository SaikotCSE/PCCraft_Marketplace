// VendorProductsPage — vendor's product list. Spec §2.7 / Module 11.
//
// Lists the requesting vendor's products with inline stock + status hints,
// a search box, and an Add Product CTA.
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Edit3, Trash2, Package, Star } from 'lucide-react';
import toast from 'react-hot-toast';

import { usePageTitle } from '@/hooks/usePageTitle';
import Skeleton from '@/components/common/Skeleton';
import EmptyState from '@/components/common/EmptyState';
import StockBadge from '@/components/products/StockBadge';
import PriceDisplay from '@/components/products/PriceDisplay';
import { vendorService } from '@/services/vendorService';
import { PRODUCT_STATUS } from '@/utils/constants';

const PLACEHOLDER =
  'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4 3"><rect width="4" height="3" fill="%23e5e7eb"/></svg>';

const statusBadge = (status) => {
  const map = {
    [PRODUCT_STATUS.ACTIVE]: 'bg-success/15 text-success',
    [PRODUCT_STATUS.DRAFT]: 'bg-bg-muted text-text-secondary',
    [PRODUCT_STATUS.PAUSED]: 'bg-warning/15 text-warning',
    [PRODUCT_STATUS.HIDDEN]: 'bg-text-secondary/15 text-text-secondary',
    [PRODUCT_STATUS.ARCHIVED]: 'bg-danger/15 text-danger',
  };
  return map[status] || map[PRODUCT_STATUS.DRAFT];
};

const VendorProductsPage = () => {
  usePageTitle('My products · PCCraft');
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['vendor-products'],
    queryFn: () => vendorService.myProducts({ page_size: 50 }),
  });

  const products = Array.isArray(data?.results) ? data.results : Array.isArray(data) ? data : [];

  const deleteMutation = useMutation({
    mutationFn: (slug) => vendorService.deleteProduct(slug),
    onSuccess: () => {
      toast.success('Product removed');
      qc.invalidateQueries({ queryKey: ['vendor-products'] });
    },
    onError: () => toast.error('Could not delete the product'),
  });

  const handleDelete = (p) => {
    if (window.confirm(`Delete "${p.name}"? This cannot be undone.`)) {
      deleteMutation.mutate(p.slug);
    }
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-text-primary sm:text-3xl">My products</h1>
          <p className="mt-1 text-sm text-text-secondary">
            Manage your catalog — edit, restock, archive, or add new items.
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate('/vendor/products/new')}
          className="inline-flex items-center gap-2 rounded-lg bg-accent-500 px-4 py-2 text-sm font-semibold text-white hover:bg-accent-600"
        >
          <Plus className="h-4 w-4" />
          Add product
        </button>
      </header>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : products.length === 0 ? (
        <EmptyState
          icon={Package}
          title="No products yet"
          description="Add your first product to start selling on PCCraft."
          cta={{ label: 'Add product', to: '/vendor/products/new' }}
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-surface">
          <table className="w-full text-sm">
            <thead className="bg-bg-muted text-left text-xs font-semibold uppercase tracking-wide text-text-secondary">
              <tr>
                <th className="px-4 py-3">Product</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3 text-right">Price</th>
                <th className="px-4 py-3">Stock</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {products.map((p) => (
                <tr key={p.id || p.slug} className="hover:bg-bg-muted/50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <img
                        src={p.primary_image?.image || p.primary_image_url || PLACEHOLDER}
                        alt=""
                        className="h-12 w-12 rounded-md border border-border object-cover"
                      />
                      <div>
                        <Link
                          to={`/products/${p.slug}`}
                          className="font-semibold text-text-primary hover:text-accent-500"
                        >
                          {p.name}
                        </Link>
                        {p.is_featured && (
                          <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-accent-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                            <Star className="h-3 w-3" />
                            Featured
                          </span>
                        )}
                        <p className="text-xs text-text-secondary">{p.sku || p.slug}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-text-secondary">{p.category?.name || '—'}</td>
                  <td className="px-4 py-3 text-right">
                    <PriceDisplay
                      base_price={p.base_price}
                      discounted_price={p.discounted_price}
                      effective_price={p.effective_price}
                      discount_percent={p.discount_percent}
                      size="sm"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <StockBadge
                      stock_status={p.stock_status}
                      stock_quantity={p.stock_quantity}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusBadge(p.status)}`}
                    >
                      {p.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <Link
                        to={`/vendor/products/${p.slug}/edit`}
                        className="rounded-md border border-border p-1.5 text-text-secondary hover:border-accent-300 hover:text-accent-500"
                        aria-label="Edit"
                      >
                        <Edit3 className="h-4 w-4" />
                      </Link>
                      <button
                        type="button"
                        onClick={() => handleDelete(p)}
                        disabled={deleteMutation.isPending}
                        className="rounded-md border border-border p-1.5 text-text-secondary hover:border-danger hover:text-danger disabled:opacity-50"
                        aria-label="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default VendorProductsPage;