// AdminCategoryFormPage — Module 9 admin create/edit form for Category.
//
// Mounted at /admin/categories/new (create) and /admin/categories/:slug/edit.
// Backend `parent` field accepts the Category PK (UUID); the dropdown
// shows name + slug and submits the selected UUID.
import { useEffect, useMemo, useState } from 'react';
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
  parent: '',
  description: '',
  icon: null,
  image: null,
  display_order: 0,
  is_active: true,
  spec_template: {},
};

const AdminCategoryFormPage = () => {
  usePageTitle('Category · Admin · PCCraft');
  const navigate = useNavigate();
  const { slug } = useParams();
  const isEdit = Boolean(slug);
  const queryClient = useQueryClient();

  const [form, setForm] = useState(EMPTY);
  const [specJson, setSpecJson] = useState('{}');

  const detail = useQuery({
    queryKey: ['admin', 'category', slug],
    queryFn: () => adminService.getCategory(slug),
    enabled: isEdit,
  });

  const tree = useQuery({
    queryKey: ['admin', 'categories', 'tree'],
    queryFn: () => adminService.categoryTree(),
  });

  const parentOptions = useMemo(() => {
    const roots = Array.isArray(tree.data) ? tree.data : [];
    const out = [];
    const visit = (node, depth) => {
      if (isEdit && node.slug === slug) return; // can't parent to self
      out.push({ id: node.id, label: `${'— '.repeat(depth)}${node.name} (${node.slug})` });
      (node.children || []).forEach((c) => visit(c, depth + 1));
    };
    roots.forEach((r) => visit(r, 0));
    return out;
  }, [tree.data, isEdit, slug]);

  useEffect(() => {
    if (detail.data && isEdit) {
      const d = detail.data;
      setForm({
        name: d.name || '',
        slug: d.slug || '',
        parent: d.parent?.id || '',
        description: d.description || '',
        icon: d.icon || null,
        image: d.image || null,
        display_order: d.display_order ?? 0,
        is_active: d.is_active !== false,
        spec_template: d.spec_template || {},
      });
      setSpecJson(JSON.stringify(d.spec_template || {}, null, 2));
    }
  }, [detail.data, isEdit]);

  const saveMutation = useMutation({
    mutationFn: (payload) =>
      isEdit
        ? adminService.updateCategory(slug, payload)
        : adminService.createCategory(payload),
    onSuccess: () => {
      toast.success(isEdit ? 'Category updated' : 'Category created');
      queryClient.invalidateQueries({ queryKey: ['admin', 'categories'] });
      navigate(paths.adminCategories());
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
    let parsedSpec = {};
    try {
      parsedSpec = JSON.parse(specJson || '{}');
    } catch {
      toast.error('Spec template must be valid JSON');
      return;
    }
    const payload = {
      ...form,
      parent: form.parent || null,
      spec_template: parsedSpec,
    };
    saveMutation.mutate(payload);
  };

  if (isEdit && detail.isLoading) {
    return <div className="p-8 text-text-secondary">Loading category…</div>;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <header className="flex items-center justify-between gap-3">
        <div>
          <Link
            to={paths.adminCategories()}
            className="inline-flex items-center gap-1 text-xs font-medium text-text-secondary hover:text-text-primary"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to categories
          </Link>
          <h1 className="mt-1 font-heading text-2xl font-bold text-text-primary">
            {isEdit ? `Edit category · ${slug}` : 'New category'}
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

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Parent category" hint="Leave blank for a top-level node.">
            <select
              value={form.parent}
              onChange={set('parent')}
              className="input"
            >
              <option value="">— (top level)</option>
              {parentOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </Field>
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
        </div>

        <Field label="Description">
          <textarea
            rows={4}
            value={form.description}
            onChange={set('description')}
            className="input"
            placeholder="What products belong in this category?"
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Icon" hint="Square icon, optional.">
            <FileUpload
              value={form.icon}
              onChange={(file) =>
                setForm((p) => ({ ...p, icon: typeof file === 'string' ? file : null }))
              }
              accept="image/*"
            />
            {form.icon && typeof form.icon === 'string' && (
              <img
                src={form.icon}
                alt="Icon preview"
                className="mt-2 h-16 w-16 rounded border border-surface-200 object-contain bg-surface-50"
              />
            )}
          </Field>
          <Field label="Banner image" hint="Wide hero, optional.">
            <FileUpload
              value={form.image}
              onChange={(file) =>
                setForm((p) => ({ ...p, image: typeof file === 'string' ? file : null }))
              }
              accept="image/*"
            />
            {form.image && typeof form.image === 'string' && (
              <img
                src={form.image}
                alt="Banner preview"
                className="mt-2 h-16 w-full rounded border border-surface-200 object-cover"
              />
            )}
          </Field>
        </div>

        <Field label="Active">
          <button
            type="button"
            role="switch"
            aria-checked={form.is_active}
            onClick={() =>
              setForm((p) => ({ ...p, is_active: !p.is_active }))
            }
            className={
              'inline-flex h-7 w-12 items-center rounded-full transition-colors ' +
              (form.is_active ? 'bg-accent-500' : 'bg-surface-300')
            }
          >
            <span
              className={
                'inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ' +
                (form.is_active ? 'translate-x-6' : 'translate-x-1')
              }
            />
          </button>
          <span className="ml-2 text-xs text-text-secondary">
            {form.is_active ? 'Visible in the catalog' : 'Hidden from the catalog'}
          </span>
        </Field>

        <Field
          label="Spec template (JSON)"
          hint="Defines the per-product spec fields rendered in the vendor form. E.g. { 'cores': { 'type': 'integer' }, 'tdp_w': { 'type': 'number' } }"
        >
          <textarea
            rows={8}
            value={specJson}
            onChange={(e) => setSpecJson(e.target.value)}
            className="input font-mono text-xs"
            spellCheck={false}
          />
        </Field>

        <div className="flex items-center justify-end gap-2 border-t border-surface-200 pt-4">
          <Link
            to={paths.adminCategories()}
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
            {saveMutation.isLoading ? 'Saving…' : isEdit ? 'Save changes' : 'Create category'}
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

export default AdminCategoryFormPage;
