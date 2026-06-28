// CategoriesPage — full category tree. Spec §2.7.
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, FolderTree } from 'lucide-react';
import { usePageTitle } from '@/hooks/usePageTitle';
import { categoryService } from '@/services/categoryService';
import Skeleton from '@/components/common/Skeleton';
import EmptyState from '@/components/common/EmptyState';

const CategoryNode = ({ node, depth = 0 }) => {
  if (!node) return null;
  const children = node.children || [];
  return (
    <li>
      <Link
        to={`/products?category=${node.slug}`}
        className="flex items-center justify-between rounded-lg px-3 py-2 transition-colors hover:bg-bg-muted"
        style={{ paddingLeft: 12 + depth * 20 }}
      >
        <span className="flex items-center gap-2 text-sm text-text-primary">
          {children.length > 0 ? (
            <ChevronRight className="h-4 w-4 text-text-secondary" />
          ) : (
            <span className="inline-block h-4 w-4" />
          )}
          {node.name}
        </span>
        <span className="text-xs text-text-secondary">{node.product_count ?? ''}</span>
      </Link>
      {children.length > 0 && (
        <ul>
          {children.map((c) => (
            <CategoryNode key={c.slug} node={c} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  );
};

const CategoriesPage = () => {
  usePageTitle('Categories · PCCraft');

  const { data, isLoading, isError } = useQuery({
    queryKey: ['categories-tree'],
    queryFn: () => categoryService.tree(),
  });

  const tree = Array.isArray(data) ? data : data?.results ?? [];

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-6 flex items-center gap-2">
        <FolderTree className="h-6 w-6 text-accent-500" />
        <div>
          <h1 className="text-2xl font-bold text-text-primary sm:text-3xl">Categories</h1>
          <p className="mt-1 text-sm text-text-secondary">
            Browse products by their hierarchical taxonomy.
          </p>
        </div>
      </header>

      <div className="rounded-xl border border-border bg-surface p-4">
        {isLoading ? (
          <ul className="flex flex-col gap-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
          </ul>
        ) : isError || tree.length === 0 ? (
          <EmptyState
            title="No categories yet"
            description="Categories will appear here once an admin creates them."
          />
        ) : (
          <ul className="flex flex-col gap-1">
            {tree.map((node) => (
              <CategoryNode key={node.slug} node={node} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default CategoriesPage;