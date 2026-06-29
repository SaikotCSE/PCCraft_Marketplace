// Sidebar — collapsible sidebar shell for Admin + Vendor panels.
//
// Spec §1.3 lists Sidebar.jsx as part of the `layout/` bucket. The
// concrete Admin and Vendor sidebars each render their own nav groups
// and are mounted from AdminLayout.jsx / VendorLayout.jsx. This file
// is the shared skeleton (toggle, scroll container, role-aware footer)
// that the role-specific layouts compose.
//
// AdminLayout renders its sidebar inline (see AdminLayout.jsx); same
// for VendorLayout. So in practice this shared shell is a placeholder
// until a future module extracts the common chrome. It is exported so
// the spec path exists and so module-9 dashboard widgets can opt into
// a uniform look.

export default function Sidebar({ children, isOpen, onClose }) {
  if (!isOpen) return null;
  return (
    <aside className="h-full w-64 bg-surface border-r border-border overflow-y-auto">
      {children}
    </aside>
  );
}