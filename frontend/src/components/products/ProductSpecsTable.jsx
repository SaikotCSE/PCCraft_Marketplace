// ProductSpecsTable — renders `product.specs` as labelled rows derived from
// `category.spec_template`.
//
// Spec §2.7. Falls back to a generic key→value table when spec_template
// isn't supplied (e.g. older categories, or admin-curated overrides).
const formatKey = (key) =>
  key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());

const renderValue = (value, schema) => {
  if (value === null || value === undefined || value === '') return '—';
  if (schema?.type === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  if (schema?.choices?.length) {
    const match = schema.choices.find((c) => c.value === value);
    if (match) return match.label;
  }
  return String(value);
};

const ProductSpecsTable = ({ specs = {}, specTemplate = null, className = '' }) => {
  const keys = Object.keys(specs);

  if (!keys.length) {
    return (
      <p className="text-sm text-text-secondary">No specifications provided for this product.</p>
    );
  }

  // spec_template shape: { field_key: { type, label, choices?, unit? } }
  const rows = keys.map((k) => ({
    key: k,
    label: specTemplate?.[k]?.label || formatKey(k),
    value: specs[k],
    schema: specTemplate?.[k] ?? null,
  }));

  return (
    <div className={`overflow-hidden rounded-xl border border-border ${className}`}>
      <table className="w-full text-sm">
        <tbody className="divide-y divide-border">
          {rows.map(({ key, label, value, schema }) => (
            <tr key={key}>
              <th className="w-1/3 bg-bg-muted px-4 py-3 text-left font-medium text-text-secondary">
                {label}
              </th>
              <td className="px-4 py-3 text-text-primary">
                {renderValue(value, schema)}
                {schema?.unit && typeof value !== 'boolean' && (
                  <span className="ml-1 text-text-secondary">{schema.unit}</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default ProductSpecsTable;