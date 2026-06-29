// CheckoutPage — Module 4 customer checkout (the final missing piece).
//
// Per spec §"MODULE 4 — Frontend Tasks":
//   * Step 1 — Shipping Address
//       - Saved address cards; default one highlighted with accent-500
//         border.
//       - "Add New Address" opens a Modal with the address form.
//       - Per-card Edit / Delete (delete disabled on default).
//   * Step 2 — Order Review
//       - Cart items (vendor name, qty, unit price, line total).
//       - Subtotal, shipping (Free / ৳0 placeholder), tax (৳0 placeholder),
//         Total. "Back" returns to Step 1.
//   * Step 3 — Payment
//       - "Cash on Delivery" card pre-selected.
//       - bKash, Nagad, Card cards present but disabled with
//         "Coming Soon" badge.
//   * Step 4 — Confirmation
//       - Framer Motion checkmark animation.
//       - Order number displayed prominently.
//       - "View Order" button → /orders/{order_number}.
//       - Cart is cleared once we reach this step.
//
// All API calls go through orderService + cartService (per CLAUDE.md
// rule #6). Address mutations use the Zustand store so the address
// book stays in sync with the rest of the app.
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CreditCard,
  Edit3,
  MapPin,
  PackageCheck,
  Plus,
  ShieldCheck,
  Smartphone,
  Trash2,
  Truck,
  Wallet,
} from 'lucide-react';
import toast from 'react-hot-toast';

import { useCartStore } from '@context/useCartStore';
import { useOrderStore } from '@context/useOrderStore';
import { usePageTitle } from '@hooks/usePageTitle';
import EmptyState from '@components/common/EmptyState';
import Modal from '@components/common/Modal';
import Skeleton from '@components/common/Skeleton';
import Stepper from '@components/common/Stepper';
import { cn } from '@/utils/cn';
import { formatPrice } from '@utils/formatters';
import { paths } from '@routes/routePaths';

// 4 canonical steps — labels per spec.
const STEPS = [
  { title: 'Shipping', subtitle: 'Where to deliver' },
  { title: 'Review', subtitle: 'Confirm items' },
  { title: 'Payment', subtitle: 'How to pay' },
  { title: 'Confirmation', subtitle: 'All set' },
];

const SHIPPING_FEE = 0; // spec placeholder: Free / ৳0
const TAX_FEE = 0; // spec placeholder: ৳0

// Empty form factory — keeps the modal pristine on each open.
const emptyAddressForm = () => ({
  label: 'Home',
  full_name: '',
  phone: '',
  street_address: '',
  address_line2: '',
  city: '',
  district: '',
  postal_code: '',
  country: 'Bangladesh',
  is_default: false,
});

const CheckoutPage = () => {
  usePageTitle('Checkout · PCCraft');
  const navigate = useNavigate();

  // ---- stores ----
  const cartItems = useCartStore((s) => s.items);
  const fetchCart = useCartStore((s) => s.fetch);
  const clearCart = useCartStore((s) => s.clear);
  const cartLoading = useCartStore((s) => s.isLoading);

  const addresses = useOrderStore((s) => s.addresses);
  const defaultAddressId = useOrderStore((s) => s.defaultAddressId);
  const addressesLoading = useOrderStore((s) => s.addressesLoading);
  const fetchAddresses = useOrderStore((s) => s.fetchAddresses);
  const createAddress = useOrderStore((s) => s.createAddress);
  const updateAddress = useOrderStore((s) => s.updateAddress);
  const deleteAddress = useOrderStore((s) => s.deleteAddress);
  const setDefaultAddress = useOrderStore((s) => s.setDefaultAddress);
  const placeOrder = useOrderStore((s) => s.placeOrder);

  // ---- local UI state ----
  const [step, setStep] = useState(0);
  const [selectedAddressId, setSelectedAddressId] = useState(null);
  const [modal, setModal] = useState(null); // null | { mode: 'add' | 'edit', address? }
  const [placing, setPlacing] = useState(false);
  const [placedOrder, setPlacedOrder] = useState(null);

  // ---- data load ----
  useEffect(() => {
    fetchCart().catch(() => {});
    fetchAddresses().catch(() => {});
  }, [fetchCart, fetchAddresses]);

  // Default the selected address once addresses load.
  useEffect(() => {
    if (!selectedAddressId && addresses.length > 0) {
      setSelectedAddressId(defaultAddressId || addresses[0].id);
    }
  }, [addresses, defaultAddressId, selectedAddressId]);

  // ---- derived ----
  const subtotal = useMemo(
    () =>
      cartItems.reduce(
        (sum, i) => sum + Number(i.line_total ?? (Number(i.unit_price ?? 0) * Number(i.quantity ?? 0))),
        0,
      ),
    [cartItems],
  );
  const total = subtotal + SHIPPING_FEE + TAX_FEE;
  const selectedAddress = useMemo(
    () => addresses.find((a) => a.id === selectedAddressId) || null,
    [addresses, selectedAddressId],
  );
  const cartIsEmpty = !cartLoading && cartItems.length === 0;

  // If we placed the order and there's nothing left in the cart, the
  // server has cleared it for us. Don't bounce the user — keep them on
  // the confirmation step.

  // ---- handlers ----
  const goNext = () => setStep((s) => Math.min(STEPS.length - 1, s + 1));
  const goBack = () => setStep((s) => Math.max(0, s - 1));

  const onPlaceOrder = async () => {
    if (!selectedAddressId) {
      toast.error('Please choose a shipping address.');
      setStep(0);
      return;
    }
    setPlacing(true);
    try {
      const order = await placeOrder({
        address_id: selectedAddressId,
        notes: '',
      });
      // Eagerly clear the local cart so step 4 looks correct even
      // before the next fetch resolves.
      try {
        await clearCart();
      } catch {
        /* server already cleared it; safe to ignore */
      }
      setPlacedOrder(order);
      setStep(3);
      toast.success('Order placed successfully!');
    } catch (err) {
      // axios interceptor surfaces a toast already.
    } finally {
      setPlacing(false);
    }
  };

  // ── render ─────────────────────────────────────────────────────
  // Empty-cart guard: if a user lands on /checkout without any items,
  // send them back to the cart screen.
  if (cartIsEmpty && !placedOrder) {
    return (
      <section className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
        <EmptyState
          icon={Truck}
          title="Your cart is empty"
          description="Add a few products before heading to checkout."
          actionLabel="Browse products"
          onAction={() => navigate(paths.products())}
        />
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-6">
        <button
          type="button"
          onClick={() => navigate(paths.cart())}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-text-secondary hover:text-text-primary"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to cart
        </button>
        <h1 className="mt-2 font-heading text-3xl font-bold text-text-primary">
          Checkout
        </h1>
        <p className="mt-1 text-sm text-text-secondary">
          Complete your order in four quick steps.
        </p>
      </header>

      {/* Stepper */}
      <div className="mb-8 rounded-xl border border-border bg-surface p-5 shadow-sm">
        <Stepper steps={STEPS} currentStep={step + 1} />
      </div>

      {/* Step body */}
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div>
          {step === 0 && (
            <StepAddress
              addresses={addresses}
              loading={addressesLoading}
              selectedAddressId={selectedAddressId}
              onSelect={setSelectedAddressId}
              onAdd={() => setModal({ mode: 'add' })}
              onEdit={(a) => setModal({ mode: 'edit', address: a })}
              onDelete={(a) => {
                if (a.is_default) {
                  toast.error('Cannot delete the default address.');
                  return;
                }
                if (window.confirm(`Delete address "${a.label || a.full_name}"?`)) {
                  deleteAddress(a.id).catch(() => {});
                }
              }}
              onSetDefault={(a) => setDefaultAddress(a.id).catch(() => {})}
            />
          )}

          {step === 1 && (
            <StepReview cartItems={cartItems} />
          )}

          {step === 2 && (
            <StepPayment />
          )}

          {step === 3 && (
            <StepConfirmation order={placedOrder} />
          )}

          {/* Nav row */}
          <div className="mt-6 flex items-center justify-between">
            <button
              type="button"
              onClick={goBack}
              disabled={step === 0 || step === 3 || placing}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium text-text-primary shadow-sm hover:border-accent-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </button>

            {step < 2 && (
              <button
                type="button"
                onClick={goNext}
                disabled={step === 0 && !selectedAddressId}
                className="inline-flex items-center gap-1.5 rounded-md bg-accent-500 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-accent-400 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Continue
                <ArrowRight className="h-4 w-4" />
              </button>
            )}

            {step === 2 && (
              <button
                type="button"
                onClick={onPlaceOrder}
                disabled={placing || !selectedAddressId}
                className="inline-flex items-center gap-1.5 rounded-md bg-accent-500 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-accent-400 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {placing ? 'Placing order…' : 'Place order'}
                {!placing && <Check className="h-4 w-4" />}
              </button>
            )}
          </div>
        </div>

        {/* Order summary sidebar */}
        <aside className="lg:sticky lg:top-20 lg:self-start">
          <div className="rounded-xl border border-border bg-surface p-5 shadow-sm">
            <h3 className="font-heading text-base font-semibold text-text-primary">
              Order summary
            </h3>
            <ul className="mt-3 space-y-2 text-sm">
              {cartItems.slice(0, 4).map((it) => (
                <li key={it.id ?? it.product_id} className="flex items-center gap-2">
                  <div className="h-10 w-10 flex-shrink-0 overflow-hidden rounded-md border border-border bg-surface-50">
                    {it.primary_image_url || it.image_url ? (
                      <img
                        src={it.primary_image_url || it.image_url}
                        alt={it.product_name || it.name}
                        className="h-full w-full object-cover"
                      />
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-text-primary">
                      {it.product_name || it.name || 'Item'}
                    </p>
                    <p className="text-[11px] text-text-secondary">
                      {it.quantity} × {formatPrice(it.unit_price ?? it.price ?? 0)}
                    </p>
                  </div>
                  <span className="text-xs font-semibold text-text-primary">
                    {formatPrice(it.line_total ?? Number(it.unit_price ?? 0) * Number(it.quantity ?? 0))}
                  </span>
                </li>
              ))}
              {cartItems.length > 4 && (
                <li className="text-[11px] text-text-secondary">
                  +{cartItems.length - 4} more item(s)
                </li>
              )}
            </ul>

            <dl className="mt-4 space-y-1.5 border-t border-border pt-3 text-sm">
              <SummaryRow label="Subtotal" value={formatPrice(subtotal)} />
              <SummaryRow
                label="Shipping"
                value={SHIPPING_FEE === 0 ? 'Free' : formatPrice(SHIPPING_FEE)}
              />
              <SummaryRow label="VAT" value={formatPrice(TAX_FEE)} />
              <div className="mt-2 flex justify-between border-t border-border pt-2 text-base">
                <dt className="font-semibold text-text-primary">Total</dt>
                <dd className="font-bold text-text-primary">{formatPrice(total)}</dd>
              </div>
            </dl>

            <div className="mt-3 flex items-center gap-1.5 text-[11px] text-text-secondary">
              <ShieldCheck className="h-3.5 w-3.5" />
              Your order is protected by PCCraft Buyer Guarantee.
            </div>
          </div>
        </aside>
      </div>

      {/* Address modal */}
      {modal && (
        <AddressModal
          open
          mode={modal.mode}
          address={modal.address}
          hasExisting={addresses.length > 0}
          onClose={() => setModal(null)}
          onSubmit={async (values) => {
            try {
              if (modal.mode === 'add') {
                await createAddress(values);
                toast.success('Address added.');
              } else {
                await updateAddress(modal.address.id, values);
                toast.success('Address updated.');
              }
              setModal(null);
            } catch {
              /* toast handled by interceptor */
            }
          }}
        />
      )}
    </section>
  );
};

// ─────────────────────────────────────────────────────────────────────
// Step 1 — Shipping address
// ─────────────────────────────────────────────────────────────────────
const StepAddress = ({
  addresses,
  loading,
  selectedAddressId,
  onSelect,
  onAdd,
  onEdit,
  onDelete,
  onSetDefault,
}) => {
  if (loading && addresses.length === 0) {
    return (
      <div className="space-y-3">
        {[...Array(2)].map((_, i) => (
          <Skeleton key={i} className="h-28 w-full" rounded="rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <div>
      <h2 className="font-heading text-lg font-semibold text-text-primary">
        Shipping address
      </h2>
      <p className="mt-1 text-sm text-text-secondary">
        Pick where you'd like your order delivered.
      </p>

      {addresses.length === 0 ? (
        <div className="mt-4">
          <EmptyState
            icon={MapPin}
            title="No saved addresses"
            description="Add a delivery address to continue."
            actionLabel="Add address"
            onAction={onAdd}
          />
        </div>
      ) : (
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {addresses.map((a) => {
            const isSelected = a.id === selectedAddressId;
            return (
              <li key={a.id}>
                <button
                  type="button"
                  onClick={() => onSelect(a.id)}
                  className={cn(
                    'group relative flex w-full flex-col items-start gap-1 rounded-xl border bg-surface p-4 text-left shadow-sm transition',
                    isSelected
                      ? 'border-accent-500 ring-2 ring-accent-500/30'
                      : 'border-border hover:border-accent-300',
                  )}
                >
                  <div className="flex w-full items-center justify-between">
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-text-secondary">
                      <MapPin className="h-3.5 w-3.5" />
                      {a.label || 'Address'}
                    </span>
                    {a.is_default && (
                      <span className="rounded-full bg-accent-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent-700">
                        Default
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-sm font-semibold text-text-primary">
                    {a.full_name}
                  </p>
                  <p className="text-xs text-text-secondary">{a.phone}</p>
                  <p className="mt-1 text-xs text-text-secondary">
                    {a.street_address}
                    {a.address_line2 ? `, ${a.address_line2}` : ''}
                    <br />
                    {a.city}
                    {a.district ? `, ${a.district}` : ''} {a.postal_code}
                  </p>

                  {/* Actions */}
                  <span
                    role="presentation"
                    onClick={(e) => e.stopPropagation()}
                    className="mt-3 flex items-center gap-3 text-xs"
                  >
                    <button
                      type="button"
                      onClick={() => onEdit(a)}
                      className="inline-flex items-center gap-1 font-medium text-text-secondary hover:text-accent-600"
                    >
                      <Edit3 className="h-3 w-3" /> Edit
                    </button>
                    {!a.is_default && (
                      <button
                        type="button"
                        onClick={() => onDelete(a)}
                        className="inline-flex items-center gap-1 font-medium text-text-secondary hover:text-danger"
                      >
                        <Trash2 className="h-3 w-3" /> Delete
                      </button>
                    )}
                    {!a.is_default && (
                      <button
                        type="button"
                        onClick={() => onSetDefault(a)}
                        className="font-medium text-text-secondary hover:text-accent-600"
                      >
                        Set default
                      </button>
                    )}
                  </span>

                  {isSelected && (
                    <span className="absolute right-3 top-3 inline-flex h-5 w-5 items-center justify-center rounded-full bg-accent-500 text-white">
                      <Check className="h-3 w-3" />
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {addresses.length > 0 && (
        <button
          type="button"
          onClick={onAdd}
          className="mt-4 inline-flex items-center gap-1.5 rounded-md border border-dashed border-border bg-surface px-4 py-2 text-sm font-medium text-text-primary shadow-sm hover:border-accent-500 hover:text-accent-600"
        >
          <Plus className="h-4 w-4" />
          Add new address
        </button>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────
// Step 2 — Review items
// ─────────────────────────────────────────────────────────────────────
const StepReview = ({ cartItems }) => (
  <div>
    <h2 className="font-heading text-lg font-semibold text-text-primary">
      Review your order
    </h2>
    <p className="mt-1 text-sm text-text-secondary">
      Confirm the items and quantities before payment.
    </p>

    <ul className="mt-4 divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
      {cartItems.map((it) => {
        const unitPrice = Number(it.unit_price ?? it.price ?? 0);
        const qty = Number(it.quantity ?? 0);
        const line = Number(it.line_total ?? unitPrice * qty);
        const name = it.product_name || it.name || 'Product';
        const image = it.primary_image_url || it.image_url;
        const vendor =
          it.vendor_name ||
          it.vendor?.store_name ||
          (it.product?.vendor?.store_name ?? '');
        return (
          <li key={it.id ?? it.product_id} className="flex items-start gap-4 p-4">
            <div className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-md border border-border bg-surface-50">
              {image ? (
                <img src={image} alt={name} className="h-full w-full object-cover" />
              ) : null}
            </div>
            <div className="min-w-0 flex-1">
              <p className="line-clamp-2 text-sm font-medium text-text-primary">{name}</p>
              {vendor && (
                <p className="mt-0.5 text-xs text-text-secondary">Sold by {vendor}</p>
              )}
              <p className="mt-1 text-xs text-text-secondary">
                {formatPrice(unitPrice)} × {qty}
              </p>
            </div>
            <span className="text-sm font-semibold text-text-primary">{formatPrice(line)}</span>
          </li>
        );
      })}
    </ul>

    {/* Price placeholder block — mirrors the sidebar but rendered inline for mobile. */}
    <div className="mt-4 rounded-xl border border-border bg-surface p-4 text-sm shadow-sm sm:hidden">
      <PriceBlock />
    </div>
  </div>
);

const PriceBlock = () => {
  const cartItems = useCartStore((s) => s.items);
  const subtotal = cartItems.reduce(
    (sum, i) =>
      sum + Number(i.line_total ?? Number(i.unit_price ?? 0) * Number(i.quantity ?? 0)),
    0,
  );
  return (
    <dl className="space-y-1.5">
      <SummaryRow label="Subtotal" value={formatPrice(subtotal)} />
      <SummaryRow label="Shipping" value="Free" />
      <SummaryRow label="VAT" value={formatPrice(TAX_FEE)} />
      <div className="mt-2 flex justify-between border-t border-border pt-2 text-base">
        <dt className="font-semibold text-text-primary">Total</dt>
        <dd className="font-bold text-text-primary">
          {formatPrice(subtotal + TAX_FEE)}
        </dd>
      </div>
    </dl>
  );
};

// ─────────────────────────────────────────────────────────────────────
// Step 3 — Payment
// ─────────────────────────────────────────────────────────────────────
const PAYMENT_METHODS = [
  {
    id: 'COD',
    label: 'Cash on Delivery',
    description: 'Pay in cash when your order arrives at your door.',
    icon: Wallet,
    enabled: true,
  },
  {
    id: 'BKASH',
    label: 'bKash',
    description: 'Pay securely with your bKash mobile wallet.',
    icon: Smartphone,
    enabled: false,
  },
  {
    id: 'NAGAD',
    label: 'Nagad',
    description: 'Pay with your Nagad mobile wallet.',
    icon: Smartphone,
    enabled: false,
  },
  {
    id: 'CARD',
    label: 'Credit / Debit Card',
    description: 'Visa, Mastercard and other major cards.',
    icon: CreditCard,
    enabled: false,
  },
];

const StepPayment = () => {
  const [selected, setSelected] = useState('COD');
  return (
    <div>
      <h2 className="font-heading text-lg font-semibold text-text-primary">
        Payment method
      </h2>
      <p className="mt-1 text-sm text-text-secondary">
        Choose how you'd like to pay. Only Cash on Delivery is active today.
      </p>

      <ul className="mt-4 grid gap-3 sm:grid-cols-2">
        {PAYMENT_METHODS.map((m) => {
          const Icon = m.icon;
          const isSelected = selected === m.id;
          return (
            <li key={m.id}>
              <button
                type="button"
                disabled={!m.enabled}
                onClick={() => setSelected(m.id)}
                className={cn(
                  'relative flex w-full items-start gap-3 rounded-xl border bg-surface p-4 text-left shadow-sm transition',
                  isSelected && m.enabled
                    ? 'border-accent-500 ring-2 ring-accent-500/30'
                    : 'border-border',
                  m.enabled
                    ? 'hover:border-accent-300'
                    : 'cursor-not-allowed opacity-70',
                )}
              >
                <span
                  className={cn(
                    'grid h-9 w-9 flex-shrink-0 place-items-center rounded-full',
                    m.enabled
                      ? 'bg-accent-100 text-accent-700'
                      : 'bg-surface-100 text-text-secondary',
                  )}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-text-primary">
                      {m.label}
                    </span>
                    {!m.enabled && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
                        Coming Soon
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 block text-xs text-text-secondary">
                    {m.description}
                  </span>
                </span>
                {isSelected && m.enabled && (
                  <span className="absolute right-3 top-3 inline-flex h-5 w-5 items-center justify-center rounded-full bg-accent-500 text-white">
                    <Check className="h-3 w-3" />
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────
// Step 4 — Confirmation
// ─────────────────────────────────────────────────────────────────────
const StepConfirmation = ({ order }) => {
  const navigate = useNavigate();
  return (
    <div className="rounded-xl border border-border bg-surface p-8 text-center shadow-sm">
      <motion.div
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 220, damping: 18 }}
        className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-emerald-100 text-emerald-600"
      >
        <PackageCheck className="h-10 w-10" />
      </motion.div>

      <motion.h2
        initial={{ y: 8, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.15 }}
        className="mt-5 font-heading text-2xl font-bold text-text-primary"
      >
        Order placed!
      </motion.h2>
      <motion.p
        initial={{ y: 8, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.25 }}
        className="mt-2 text-sm text-text-secondary"
      >
        Thanks for shopping with PCCraft. We'll start processing your order right away.
      </motion.p>

      <motion.div
        initial={{ y: 8, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.35 }}
        className="mx-auto mt-6 inline-flex flex-col items-center gap-1 rounded-lg border border-border bg-surface-50 px-5 py-3"
      >
        <span className="text-[11px] font-medium uppercase tracking-wide text-text-secondary">
          Order number
        </span>
        <span className="font-mono text-lg font-bold text-text-primary">
          {order?.order_number || '—'}
        </span>
      </motion.div>

      <motion.div
        initial={{ y: 8, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.45 }}
        className="mt-6 flex flex-wrap items-center justify-center gap-3"
      >
        <button
          type="button"
          onClick={() => navigate(paths.orderDetail(order?.order_number || ''))}
          disabled={!order?.order_number}
          className="inline-flex items-center gap-1.5 rounded-md bg-accent-500 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-accent-400 disabled:opacity-60"
        >
          View order
          <ArrowRight className="h-4 w-4" />
        </button>
        <Link
          to={paths.products()}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium text-text-primary hover:border-accent-500"
        >
          Continue shopping
        </Link>
      </motion.div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────
// Address modal — add / edit
// ─────────────────────────────────────────────────────────────────────
const AddressModal = ({
  open,
  mode,
  address,
  hasExisting,
  onClose,
  onSubmit,
}) => {
  const [values, setValues] = useState(emptyAddressForm());
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  // Reset whenever the modal opens or switches mode.
  useEffect(() => {
    if (!open) return;
    if (mode === 'edit' && address) {
      setValues({
        label: address.label || 'Home',
        full_name: address.full_name || '',
        phone: address.phone || '',
        street_address: address.street_address || '',
        address_line2: address.address_line2 || '',
        city: address.city || '',
        district: address.district || '',
        postal_code: address.postal_code || '',
        country: address.country || 'Bangladesh',
        is_default: !!address.is_default,
      });
    } else {
      setValues({
        ...emptyAddressForm(),
        // First address auto-defaults server-side; surface that in UI too.
        is_default: !hasExisting,
      });
    }
    setErrors({});
  }, [open, mode, address, hasExisting]);

  const setField = (name) => (e) => {
    const v = e?.target?.type === 'checkbox' ? e.target.checked : e.target.value;
    setValues((prev) => ({ ...prev, [name]: v }));
  };

  const validate = () => {
    const next = {};
    if (!values.full_name.trim()) next.full_name = 'Full name is required.';
    if (!values.phone.trim()) next.phone = 'Phone is required.';
    if (values.phone.trim().length < 7) next.phone = 'Phone looks too short.';
    if (!values.street_address.trim())
      next.street_address = 'Street address is required.';
    if (!values.city.trim()) next.city = 'City is required.';
    if (!values.district.trim()) next.district = 'District is required.';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const submit = async () => {
    if (!validate()) return;
    setSubmitting(true);
    try {
      await onSubmit({
        ...values,
        // Trim all string fields for cleanliness.
        full_name: values.full_name.trim(),
        phone: values.phone.trim(),
        street_address: values.street_address.trim(),
        address_line2: values.address_line2.trim(),
        city: values.city.trim(),
        district: values.district.trim(),
        postal_code: values.postal_code.trim(),
      });
    } catch {
      // parent handles the toast
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={mode === 'edit' ? 'Edit address' : 'Add new address'}
      size="lg"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-medium text-text-primary hover:border-accent-500 disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={submitting}
            className="rounded-md bg-accent-500 px-4 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-accent-400 disabled:opacity-60"
          >
            {submitting ? 'Saving…' : mode === 'edit' ? 'Save changes' : 'Save address'}
          </button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="grid gap-3 sm:grid-cols-2"
      >
        <Field label="Label" className="sm:col-span-1">
          <select
            value={values.label}
            onChange={setField('label')}
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm shadow-sm focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/30"
          >
            <option value="Home">Home</option>
            <option value="Office">Office</option>
            <option value="Other">Other</option>
          </select>
        </Field>

        <Field label="Full name" error={errors.full_name} required>
          <input
            type="text"
            value={values.full_name}
            onChange={setField('full_name')}
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm shadow-sm focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/30"
          />
        </Field>

        <Field label="Phone" error={errors.phone} required>
          <input
            type="tel"
            value={values.phone}
            onChange={setField('phone')}
            placeholder="+880 1XXX XXX XXX"
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm shadow-sm focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/30"
          />
        </Field>

        <Field label="Street address" error={errors.street_address} required className="sm:col-span-2">
          <input
            type="text"
            value={values.street_address}
            onChange={setField('street_address')}
            placeholder="House + road"
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm shadow-sm focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/30"
          />
        </Field>

        <Field label="Address line 2 (optional)" className="sm:col-span-2">
          <input
            type="text"
            value={values.address_line2}
            onChange={setField('address_line2')}
            placeholder="Apartment, floor, etc."
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm shadow-sm focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/30"
          />
        </Field>

        <Field label="City" error={errors.city} required>
          <input
            type="text"
            value={values.city}
            onChange={setField('city')}
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm shadow-sm focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/30"
          />
        </Field>

        <Field label="District" error={errors.district} required>
          <input
            type="text"
            value={values.district}
            onChange={setField('district')}
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm shadow-sm focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/30"
          />
        </Field>

        <Field label="Postal code">
          <input
            type="text"
            value={values.postal_code}
            onChange={setField('postal_code')}
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm shadow-sm focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/30"
          />
        </Field>

        <Field label="Country">
          <input
            type="text"
            value={values.country}
            onChange={setField('country')}
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm shadow-sm focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/30"
          />
        </Field>

        <label className="sm:col-span-2 mt-1 inline-flex items-center gap-2 text-sm text-text-primary">
          <input
            type="checkbox"
            checked={values.is_default}
            onChange={setField('is_default')}
            className="h-4 w-4 rounded border-border text-accent-500 focus:ring-accent-500"
          />
          Set as default address
        </label>
      </form>
    </Modal>
  );
};

// ─────────────────────────────────────────────────────────────────────
// Small helpers
// ─────────────────────────────────────────────────────────────────────
const SummaryRow = ({ label, value, valueClass = '' }) => (
  <div className="flex items-center justify-between text-text-secondary">
    <dt>{label}</dt>
    <dd className={cn('font-medium', valueClass || 'text-text-primary')}>
      {value}
    </dd>
  </div>
);

const Field = ({ label, error, required, children, className = '' }) => (
  <div className={className}>
    <label className="mb-1 block text-xs font-medium text-text-secondary">
      {label}
      {required && <span className="ml-0.5 text-danger">*</span>}
    </label>
    {children}
    {error && <p className="mt-1 text-[11px] text-danger">{error}</p>}
  </div>
);

export default CheckoutPage;
