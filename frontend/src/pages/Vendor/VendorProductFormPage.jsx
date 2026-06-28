// VendorProductFormPage — unified create + edit form. Spec §2.7 / §2.4.
//
// Used by both /vendor/products/new and /vendor/products/:slug/edit.
// Backend accepts brand/category by SLUG, so we work in slug fields too.
// spec_template is a JSON dict on Category → dynamic fields rendered below.
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Save, Send } from 'lucide-react';
import toast from 'react-hot-toast';

import { usePageTitle } from '@/hooks/usePageTitle';
import FileUpload from '@/components/common/FileUpload';
import Skeleton from '@/components/common/Skeleton';
import { vendorService } from '@/services/vendorService';
import { brandService } from '@/services/brandService';
import { categoryService } from '@/services/categoryService';
import { PRODUCT_STATUS } from '@/utils/constants';

// ── Zod schema (client-side fast-fail; server is the source of truth) ─
const productSchema = z
  .object({
    name: z.string().trim().min(2, 'Name is required').max(255),
    brand: z.string().trim().min(1, 'Brand is required'),
    category: z.string().trim().min(1, 'Category is required'),
    short_description: z.string().trim().max(500).optional().default(''),
    description: z.string().trim().optional().default(''),
    base_price: z.coerce.number().positive('Base price must be > 0'),
    discounted_price: z.coerce.number().nonnegative().optional().nullable(),
    discount_start: z.string().optional().nullable(),
    discount_end: z.string().optional().nullable(),
    sku: z.string().trim().max(120).optional().default(''),
    stock_quantity: z.coerce.number().int().min(0).default(0),
    low_stock_threshold: z.coerce.number().int().min(0).default(5),
    weight_kg: z.coerce.number().nonnegative().optional().nullable(),
    warranty_months: z.coerce.number().int().min(0).default(0),
    status: z.enum([
      PRODUCT_STATUS.DRAFT,
      PRODUCT_STATUS.ACTIVE,
      PRODUCT_STATUS.PAUSED,
      PRODUCT_STATUS.HIDDEN,
    ]),
    is_featured: z.boolean().default(false),
    specs: z.record(z.any()).default({}),
  })
  .superRefine((d, ctx) => {
    if (d.discounted_price != null && d.discounted_price >= d.base_price) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['discounted_price'],
        message: 'Discounted price must be less than base price',
      });
    }
    if ((d.discount_start && !d.discount_end) || (!d.discount_start && d.discount_end)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['discount_end'],
        message: 'Both start and end dates are required for a discount',
      });
    }
  });

const fieldSpecToZodType = (spec) => {
  switch (spec?.type) {
    case 'number':
    case 'integer':
      return z.coerce.number();
    case 'boolean':
      return z.boolean();
    default:
      return z.string();
  }
};

// ── Helpers ───────────────────────────────────────────────────────────
const formatLabel = (key) =>
  key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

const SpecField = ({ spec, keyName, value, onChange }) => {
  const baseCls =
    'w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-accent-500 focus:outline-none';

  if (spec?.type === 'boolean') {
    return (
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(e) => onChange(e.target.checked)}
          className="h-4 w-4 rounded border-border text-accent-500 focus:ring-accent-500"
        />
        {spec.label || formatLabel(keyName)}
      </label>
    );
  }

  if (spec?.choices?.length) {
    return (
      <select
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        className={baseCls}
      >
        <option value="">— Select —</option>
        {spec.choices.map((c) => (
          <option key={c.value} value={c.value}>
            {c.label}
          </option>
        ))}
      </select>
    );
  }

  if (spec?.type === 'integer' || spec?.type === 'number') {
    return (
      <input
        type="number"
        step={spec.type === 'integer' ? '1' : 'any'}
        value={value ?? ''}
        onChange={(e) =>
          onChange(e.target.value === '' ? null : Number(e.target.value))
        }
        className={baseCls}
        placeholder={spec.unit ? `in ${spec.unit}` : ''}
      />
    );
  }

  return (
    <input
      type="text"
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
      className={baseCls}
    />
  );
};

// ── Main page ─────────────────────────────────────────────────────────
const VendorProductFormPage = () => {
  const { slug } = useParams();
  const isEdit = Boolean(slug);
  usePageTitle(isEdit ? 'Edit product · PCCraft' : 'New product · PCCraft');
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [images, setImages] = useState([]); // FileUpload drafts

  // Reference data
  const { data: brands } = useQuery({
    queryKey: ['brands-all'],
    queryFn: () => brandService.list({ page_size: 100 }),
  });
  const { data: categoriesResp } = useQuery({
    queryKey: ['categories-tree'],
    queryFn: () => categoryService.tree(),
  });
  const categories = useMemo(() => {
    const arr = Array.isArray(categoriesResp) ? categoriesResp : categoriesResp?.results ?? [];
    const flat = [];
    const walk = (n) => {
      flat.push(n);
      (n.children || []).forEach(walk);
    };
    arr.forEach(walk);
    return flat;
  }, [categoriesResp]);

  // Existing product (edit only)
  const { data: existing, isLoading: loadingExisting } = useQuery({
    queryKey: ['vendor-product', slug],
    queryFn: () => vendorService.myProduct(slug),
    enabled: isEdit,
  });

  const form = useForm({
    resolver: zodResolver(productSchema),
    defaultValues: {
      name: '',
      brand: '',
      category: '',
      short_description: '',
      description: '',
      base_price: 0,
      discounted_price: null,
      discount_start: '',
      discount_end: '',
      sku: '',
      stock_quantity: 0,
      low_stock_threshold: 5,
      weight_kg: null,
      warranty_months: 0,
      status: PRODUCT_STATUS.DRAFT,
      is_featured: false,
      specs: {},
    },
  });

  // Hydrate form when editing
  useEffect(() => {
    if (!existing) return;
    form.reset({
      name: existing.name,
      brand: existing.brand?.slug || '',
      category: existing.category?.slug || '',
      short_description: existing.short_description || '',
      description: existing.description || '',
      base_price: Number(existing.base_price) || 0,
      discounted_price:
        existing.discounted_price != null ? Number(existing.discounted_price) : null,
      discount_start: existing.discount_start || '',
      discount_end: existing.discount_end || '',
      sku: existing.sku || '',
      stock_quantity: existing.stock_quantity ?? 0,
      low_stock_threshold: existing.low_stock_threshold ?? 5,
      weight_kg: existing.weight_kg != null ? Number(existing.weight_kg) : null,
      warranty_months: existing.warranty_months ?? 0,
      status: existing.status || PRODUCT_STATUS.DRAFT,
      is_featured: Boolean(existing.is_featured),
      specs: existing.specs || {},
    });
    setImages(
      (existing.images || []).map((img) => ({
        id: img.id,
        url: img.image,
        alt_text: img.alt_text,
        is_primary: img.is_primary,
        display_order: img.display_order,
      })),
    );
  }, [existing, form]);

  const selectedCategorySlug = form.watch('category');
  const selectedCategory = useMemo(
    () => categories.find((c) => c.slug === selectedCategorySlug) || null,
    [categories, selectedCategorySlug],
  );
  const specTemplate = selectedCategory?.spec_template || null;

  const hasDiscount = form.watch('discounted_price') != null && form.watch('discounted_price') !== '';

  // Create / update mutation (writes only — no images in this payload).
  const saveMutation = useMutation({
    mutationFn: async (values) => {
      const payload = {
        ...values,
        discounted_price:
          values.discounted_price === '' || values.discounted_price == null
            ? null
            : Number(values.discounted_price),
        discount_start: values.discount_start || null,
        discount_end: values.discount_end || null,
        weight_kg: values.weight_kg === '' || values.weight_kg == null ? null : values.weight_kg,
      };
      const product = isEdit
        ? await vendorService.updateProduct(slug, payload)
        : await vendorService.createProduct(payload);
      return product;
    },
    onSuccess: async (product) => {
      // Upload any newly added files.
      const newFiles = images.filter((i) => i.file).map((i) => i.file);
      if (newFiles.length) {
        const fd = new FormData();
        newFiles.forEach((f) => fd.append('images', f));
        try {
          await vendorService.addImages(product.slug, fd);
        } catch (err) {
          toast.error('Product saved, but some images failed to upload.');
        }
      }
      // Set primary if user changed it to a fresh image.
      const primaryNew = images.find((i) => i.file && i.is_primary);
      if (primaryNew?._localId) {
        // best-effort; backend usually already promoted it server-side
      }
      toast.success(isEdit ? 'Product updated' : 'Product created');
      qc.invalidateQueries({ queryKey: ['vendor-product', product.slug] });
      qc.invalidateQueries({ queryKey: ['vendor-products'] });
      navigate(`/vendor/products`);
    },
    onError: (err) => {
      const msg = err?.response?.data?.error?.message || 'Save failed.';
      toast.error(msg);
    },
  });

  const onSubmit = (values) => saveMutation.mutate(values);

  if (isEdit && loadingExisting) {
    return (
      <div className="mx-auto max-w-4xl space-y-4 px-4 py-8">
        <Skeleton className="h-8 w-1/2" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  const brandList = Array.isArray(brands) ? brands : brands?.results ?? [];

  return (
    <form
      onSubmit={form.handleSubmit(onSubmit)}
      className="mx-auto max-w-4xl space-y-6 px-4 py-8 sm:px-6 lg:px-8"
    >
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">
            {isEdit ? 'Edit product' : 'Add a new product'}
          </h1>
          <p className="mt-1 text-sm text-text-secondary">
            Fill out the basics, attach images, set pricing, and pick the category's spec fields.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => navigate('/vendor/products')}
            className="rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-text-primary hover:bg-bg-muted"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saveMutation.isPending}
            className="inline-flex items-center gap-2 rounded-lg bg-accent-500 px-4 py-2 text-sm font-semibold text-white hover:bg-accent-600 disabled:opacity-50"
          >
            {saveMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : isEdit ? (
              <Save className="h-4 w-4" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            {isEdit ? 'Save changes' : 'Create product'}
          </button>
        </div>
      </header>

      {/* Basics */}
      <section className="rounded-xl border border-border bg-surface p-5">
        <h2 className="mb-4 text-base font-semibold text-text-primary">Basics</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Product name" error={form.formState.errors.name?.message}>
            <input
              {...form.register('name')}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-accent-500 focus:outline-none"
            />
          </Field>
          <Field label="SKU (auto if blank)" error={form.formState.errors.sku?.message}>
            <input
              {...form.register('sku')}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-accent-500 focus:outline-none"
            />
          </Field>
          <Field label="Brand" error={form.formState.errors.brand?.message}>
            <select
              {...form.register('brand')}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-accent-500 focus:outline-none"
            >
              <option value="">Select a brand</option>
              {brandList.map((b) => (
                <option key={b.slug} value={b.slug}>
                  {b.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Category" error={form.formState.errors.category?.message}>
            <select
              {...form.register('category')}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-accent-500 focus:outline-none"
            >
              <option value="">Select a category</option>
              {categories.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.parent ? `↳ ${c.name}` : c.name}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field
          label="Short description (≤ 500 chars)"
          className="mt-4"
          error={form.formState.errors.short_description?.message}
        >
          <input
            {...form.register('short_description')}
            maxLength={500}
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-accent-500 focus:outline-none"
          />
        </Field>
        <Field label="Long description" className="mt-4" error={form.formState.errors.description?.message}>
          <textarea
            {...form.register('description')}
            rows={4}
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-accent-500 focus:outline-none"
          />
        </Field>
      </section>

      {/* Pricing */}
      <section className="rounded-xl border border-border bg-surface p-5">
        <h2 className="mb-4 text-base font-semibold text-text-primary">Pricing</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Base price (BDT)" error={form.formState.errors.base_price?.message}>
            <input
              type="number"
              step="0.01"
              {...form.register('base_price')}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-accent-500 focus:outline-none"
            />
          </Field>
          <Field label="Weight (kg)" error={form.formState.errors.weight_kg?.message}>
            <input
              type="number"
              step="0.01"
              {...form.register('weight_kg')}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-accent-500 focus:outline-none"
            />
          </Field>
        </div>

        <Controller
          name="discounted_price"
          control={form.control}
          render={({ field }) => (
            <label className="mt-4 inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={field.value != null && field.value !== ''}
                onChange={(e) =>
                  field.onChange(e.target.checked ? field.value ?? 0 : null)
                }
                className="h-4 w-4 rounded border-border text-accent-500 focus:ring-accent-500"
              />
              Add discount
            </label>
          )}
        />
        {hasDiscount && (
          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field
              label="Discounted price"
              error={form.formState.errors.discounted_price?.message}
            >
              <input
                type="number"
                step="0.01"
                {...form.register('discounted_price')}
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-accent-500 focus:outline-none"
              />
            </Field>
            <Field label="Discount start" error={form.formState.errors.discount_start?.message}>
              <input
                type="date"
                {...form.register('discount_start')}
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-accent-500 focus:outline-none"
              />
            </Field>
            <Field label="Discount end" error={form.formState.errors.discount_end?.message}>
              <input
                type="date"
                {...form.register('discount_end')}
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-accent-500 focus:outline-none"
              />
            </Field>
          </div>
        )}
      </section>

      {/* Inventory + status */}
      <section className="rounded-xl border border-border bg-surface p-5">
        <h2 className="mb-4 text-base font-semibold text-text-primary">Inventory & status</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Stock quantity" error={form.formState.errors.stock_quantity?.message}>
            <input
              type="number"
              {...form.register('stock_quantity')}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-accent-500 focus:outline-none"
            />
          </Field>
          <Field
            label="Low-stock threshold"
            error={form.formState.errors.low_stock_threshold?.message}
          >
            <input
              type="number"
              {...form.register('low_stock_threshold')}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-accent-500 focus:outline-none"
            />
          </Field>
          <Field label="Warranty (months)" error={form.formState.errors.warranty_months?.message}>
            <input
              type="number"
              {...form.register('warranty_months')}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-accent-500 focus:outline-none"
            />
          </Field>
          <Field label="Status">
            <select
              {...form.register('status')}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-accent-500 focus:outline-none"
            >
              <option value={PRODUCT_STATUS.DRAFT}>Draft</option>
              <option value={PRODUCT_STATUS.ACTIVE}>Active</option>
              <option value={PRODUCT_STATUS.PAUSED}>Paused</option>
              <option value={PRODUCT_STATUS.HIDDEN}>Hidden</option>
            </select>
          </Field>
          <Field label="Featured" className="sm:col-span-2">
            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                {...form.register('is_featured')}
                className="h-4 w-4 rounded border-border text-accent-500 focus:ring-accent-500"
              />
              Highlight on storefront
            </label>
          </Field>
        </div>
      </section>

      {/* Specs (driven by category.spec_template) */}
      <section className="rounded-xl border border-border bg-surface p-5">
        <h2 className="mb-1 text-base font-semibold text-text-primary">Specifications</h2>
        <p className="mb-4 text-xs text-text-secondary">
          Fields depend on the selected category.
          {!specTemplate && ' Choose a category with a spec template to reveal them.'}
        </p>
        {specTemplate && (
          <Controller
            name="specs"
            control={form.control}
            render={({ field }) => {
              const specs = field.value || {};
              const update = (key, val) => field.onChange({ ...specs, [key]: val });
              return (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {Object.entries(specTemplate).map(([key, spec]) => (
                    <Field key={key} label={spec.label || formatLabel(key)}>
                      <SpecField
                        spec={spec}
                        keyName={key}
                        value={specs[key]}
                        onChange={(v) => update(key, v)}
                      />
                    </Field>
                  ))}
                </div>
              );
            }}
          />
        )}
      </section>

      {/* Images */}
      <section className="rounded-xl border border-border bg-surface p-5">
        <h2 className="mb-4 text-base font-semibold text-text-primary">Images</h2>
        <FileUpload value={images} onChange={setImages} />
      </section>

      {Object.keys(form.formState.errors).length > 0 && (
        <div className="rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
          Please fix the highlighted fields above.
        </div>
      )}
    </form>
  );
};

const Field = ({ label, error, children, className = '' }) => (
  <label className={`block ${className}`}>
    <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-text-secondary">
      {label}
    </span>
    {children}
    {error && <span className="mt-1 block text-xs text-danger">{error}</span>}
  </label>
);

export default VendorProductFormPage;