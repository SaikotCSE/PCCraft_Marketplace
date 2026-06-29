// AdminBrandFormPage — Module 9 admin create/edit form for Brand.
//
// Mounted at /admin/brands/new (create) and /admin/brands/:slug/edit (edit).
// Backend auto-slugs from name when slug is blank; we let it do that.
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Save } from 'lucide-react';
import toast from 'react-hot-toast';

import { usePageTitle } from '@/hooks/usePageTitle';
import FileUpload from '@components/common/FileUpload';
import { adminService } from '@services/adminService';
import { paths } from '@/routes/routePaths';

const EMPTY = {
  name: '',
  slug: '',
  description: '',
  website: '',
  is_featured: false,
  is_active: true,
  display_order: 0,
  logo: null,
  banner: null,
};

const AdminBrandFormPage = () => {
  usePageTitle('Brand · Admin · PCCraft');
  const navigate = useNavigate();
  const { slug } = useParams();
  const isEdit = Boolean(slug);
  const queryClient = useQueryClient();

  const [form, setForm] = useState(EMPTY);

  const detail = useQuery({
    queryKey: ['admin', 'brand', slug],
    queryFn: () => adminService.getBrand(slug),
    enabled: isEdit,
  });

  useEffect(() => {
    if (detail.data && isEdit) {
      const d = detail.data;
      setForm({
        name: d.name || '',
        slug: d.slug || '',
        description: d.description || '',
        website: d.website || '',
        is_featured: Boolean(d.is_featured),
        is_active: d.is_active !== false,
        display_order: d.display_order ?? 0,
        logo: d.logo || null,
        banner: d.banner || null,
      });
    }
  }, [detail.data, isEdit]);

  const saveMutation = useMutation({
    mutationFn: (payload) =>
      isEdit ? adminService.updateBrand(slug, payload) : adminService.createBrand(payload),
    onSuccess: () => {
      toast.success(isEdit ? 'Brand updated' : 'Brand created');
      queryClient.invalidateQueries({ queryKey: ['admin', 'brands'] });
      navigate(paths.adminBrands());
    },
    onError: (err) => {
      const message =
        err?.response?.data?.error?.message ||
        Object.values(err?.response?.data?.error?.details || {})?.[0]?.[0] ||
        'Save failed';
      toast.error(message);
    },
  });

  const set = (key) => (e) => {
    const v = e?.target?.type === 'checkbox' ? e.target.checked : e?.target?.value ?? e;
    setForm((p) => ({ ...p, [key]: v }));
  };

  const onSubmit = (e) => {
    e.preventDefault();
    saveMutation.mutate(form);
  };

  if (isEdit && detail.isLoading) {
    return <div className="p-8 text-text-secondary">Loading brand…</div>;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <header className="flex items-center justify-between gap-3">
        <div>
          <Link
            to={paths.adminBrands()}
            className="inline-flex items-center gap-1 text-xs font-medium text-text-secondary hover:text-text-primary"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to brands
          </Link>
          <h1 className="mt-1 font-heading text-2xl font-bold text-text-primary">
            {isEdit ? `Edit brand · ${slug}` : 'New brand'}
          </h1>
        </div>
      </header>

      <form
        onSubmit={onSubmit}
        className="space-y-5 rounded-xl border border-surface-200 bg-surface p-5 shadow-sm"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" required>
            <input
              required
              type="text"
              value={form.name}
              onChange={set('name')}
              className="input"
              maxLength={120}
            />
          </Field>
          <Field label="Slug" hint="Leave blank to auto-generate from name.">
            <input
              type="text"
              value={form.slug}
              onChange={set('slug')}
              className="input"
              maxLength={140}
              placeholder="auto"
            />
          </Field>
        </div>

        <Field label="Description">
          <textarea
            rows={4}
            value={form.description}
            onChange={set('description')}
            className="input"
            placeholder="Brief history, product lines, distinguishing traits…"
          />
        </Field>

        <Field label="Website">
          <input
            type="url"
            value={form.website}
            onChange={set('website')}
            className="input"
            placeholder="https://example.com"
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Display order">
            <input
              type="number"
              min="0"
              value={form.display_order}
              onChange={(e) =>
                setForm((p) => ({ ...p, display_order: Number(e.target.value) || 0 }))
              }
              className="input"
            />
          </Field>
          <Field label="Active">
            <Toggle
              checked={form.is_active}
              onChange={set('is_active')}
              label={form.is_active ? 'Active' : 'Inactive'}
            />
          </Field>
          <Field label="Featured">
            <Toggle
              checked={form.is_featured}
              onChange={set('is_featured')}
              label={form.is_featured ? 'Featured' : 'Standard'}
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Logo" hint="JPG/PNG/WEBP, max 2 MB.">
            <FileUpload
              value={form.logo}
              onChange={(file) =>
                setForm((p) => ({ ...p, logo: typeof file === 'string' ? file : null }))
              }
              accept="image/*"
            />
            {form.logo && typeof form.logo === 'string' && (
              <img
                src={form.logo}
                alt="Logo preview"
                className="mt-2 h-16 rounded-md border border-surface-200 object-contain bg-surface-50"
              />
            )}
          </Field>
          <Field label="Banner" hint="JPG/PNG/WEBP, max 8 MB.">
            <FileUpload
              value={form.banner}
              onChange={(file) =>
                setForm((p) => ({ ...p, banner: typeof file === 'string' ? file : null }))
              }
              accept="image/*"
            />
            {form.banner && typeof form.banner === 'string' && (
              <img
                src={form.banner}
                alt="Banner preview"
                className="mt-2 h-16 w-full rounded-md border border-surface-200 object-cover"
              />
            )}
          </Field>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-surface-200 pt-4">
          <Link
            to={paths.adminBrands()}
            className="rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium hover:bg-surface-100"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={saveMutation.isLoading}
            className="inline-flex items-center gap-1.5 rounded-md bg-accent-500 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-accent-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Save className="h-4 w-4" />
            {saveMutation.isLoading ? 'Saving…' : isEdit ? 'Save changes' : 'Create brand'}
          </button>
        </div>
      </form>

      <style>{`
        .input {
          width: 100%;
          border-radius: 0.375rem;
          border: 1px solid rgb(226 232 240);
          background: rgb(255 255 255);
          padding: 0.5rem 0.75rem;
          font-size: 0.875rem;
          color: rgb(15 23 42);
        }
        .input:focus { outline: 2px solid rgb(250 204 21); outline-offset: 1px; }
      `}</style>
    </div>
  );
};

const Field = ({ label, children, hint, required }) => (
  <label className="block">
    <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-text-secondary">
      {label} {required && <span className="text-red-500">*</span>}
    </span>
    {children}
    {hint && <span className="mt-1 block text-xs text-text-secondary">{hint}</span>}
  </label>
);

const Toggle = ({ checked, onChange, label }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    onClick={() => onChange({ target: { type: 'checkbox', checked: !checked } })}
    className={
      'inline-flex h-7 w-12 items-center rounded-full transition-colors ' +
      (checked ? 'bg-accent-500' : 'bg-surface-300')
    }
  >
    <span
      className={
        'inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ' +
        (checked ? 'translate-x-6' : 'translate-x-1')
      }
    />
    <span className="sr-only">{label}</span>
  </button>
);

export default AdminBrandFormPage;
