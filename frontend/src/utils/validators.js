/**
 * PCCraft Marketplace — Zod schemas for client-side validation.
 *
 * Server validation (DRF serializers) remains the source of truth; these
 * schemas exist only to fail fast and give the user inline feedback before
 * the request leaves the browser.
 *
 * Field names here mirror `backend/apps/accounts/serializers.py` exactly:
 *   - Customer: full_name / email / phone / password / confirm_password /
 *               date_of_birth / gender (MALE|FEMALE|PREFER_NOT_TO_SAY) /
 *               accept_terms
 *   - Vendor:   owner_name / email / phone / password / confirm_password /
 *               business_name / business_type (SOLE_PROP|PARTNERSHIP|
 *               PVT_LTD|OTHER) / business_phone (optional) /
 *               trade_license_number / business_address /
 *               trade_license_doc / nid_number / nid_doc /
 *               accept_vendor_terms
 *
 * Phone validation matches the backend BDPhoneValidator (E.164-compatible).
 */

import { z } from 'zod';

// Bangladesh mobile (E.164-compatible): +8801XXXXXXXXX or 01XXXXXXXXX
export const bdPhoneSchema = z
  .string()
  .trim()
  .regex(/^(\+?880)?1[3-9]\d{8}$/, 'Enter a valid BD mobile number (e.g. 017XXXXXXXX)');

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email('Enter a valid email address');

export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Password must contain at least one digit');

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required'),
  role: z.enum(['customer', 'vendor', 'admin']),
});

// ─── Customer registration ────────────────────────────────────────────
export const customerRegisterSchema = z
  .object({
    full_name: z.string().trim().min(2, 'Full name is required').max(150),
    email: emailSchema,
    phone: bdPhoneSchema,
    password: passwordSchema,
    confirm_password: z.string(),
    date_of_birth: z
      .string()
      .optional()
      .refine(
        (v) => {
          if (!v) return true;
          const dob = new Date(v);
          if (Number.isNaN(dob.getTime())) return false;
          const today = new Date();
          const thirteenYearsMs = 13 * 365.25 * 24 * 60 * 60 * 1000;
          return today - dob >= thirteenYearsMs && dob <= today;
        },
        { message: 'You must be at least 13 years old' },
      ),
    gender: z
      .enum(['MALE', 'FEMALE', 'PREFER_NOT_TO_SAY'])
      .optional()
      .or(z.literal('')),
    accept_terms: z.literal(true, {
      errorMap: () => ({ message: 'You must accept the terms to continue' }),
    }),
  })
  .refine((d) => d.password === d.confirm_password, {
    path: ['confirm_password'],
    message: 'Passwords do not match',
  });

// ─── Vendor registration (4 steps collapsed for one POST) ─────────────
const businessAddressSchema = z.object({
  street: z.string().trim().min(2, 'Street is required').max(255),
  city: z.string().trim().min(2, 'City is required').max(80),
  district: z.string().trim().min(2, 'District is required').max(80),
  postal_code: z.string().trim().max(20).optional().default(''),
});

const fileSchema = z
  .instanceof(File, { message: 'Please attach a file' })
  .refine((f) => f.size <= 5 * 1024 * 1024, {
    message: 'File must be 5 MB or smaller',
  })
  .refine(
    (f) =>
      ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'].includes(f.type),
    { message: 'Use PDF, JPG, PNG, or WEBP' },
  );

export const vendorAccountSchema = z
  .object({
    owner_name: z.string().trim().min(2, 'Full name is required').max(150),
    email: emailSchema,
    phone: bdPhoneSchema,
    password: passwordSchema,
    confirm_password: z.string(),
  })
  .refine((d) => d.password === d.confirm_password, {
    path: ['confirm_password'],
    message: 'Passwords do not match',
  });

export const vendorBusinessSchema = z.object({
  business_name: z.string().trim().min(2, 'Business name is required').max(180),
  business_type: z.enum(['SOLE_PROP', 'PARTNERSHIP', 'PVT_LTD', 'OTHER']),
  business_phone: bdPhoneSchema.optional().or(z.literal('')),
  trade_license_number: z.string().trim().min(3, 'Trade license number is required').max(80),
});

export const vendorAddressSchema = businessAddressSchema;

export const vendorDocumentsSchema = z.object({
  trade_license_doc: fileSchema,
  nid_number: z.string().trim().min(4, 'NID number is required').max(40),
  nid_doc: fileSchema,
});

export const vendorStorefrontSchema = z.object({
  store_name: z.string().trim().min(2, 'Store name is required').max(120),
  store_description: z.string().trim().max(2000).optional().default(''),
  store_contact_email: z
    .string()
    .trim()
    .email('Enter a valid email')
    .optional()
    .or(z.literal('')),
  vendor_return_policy: z.string().trim().max(2000).optional().default(''),
  low_stock_threshold: z.coerce.number().int().min(1).max(32767).default(5),
  accept_vendor_terms: z.literal(true, {
    errorMap: () => ({ message: 'You must accept the vendor agreement' }),
  }),
});

// ─── Profile / password change ───────────────────────────────────────
export const profileUpdateSchema = z.object({
  full_name: z.string().trim().min(2).max(150).optional(),
  phone: bdPhoneSchema.optional().or(z.literal('')),
  date_of_birth: z.string().optional(),
  gender: z.enum(['MALE', 'FEMALE', 'PREFER_NOT_TO_SAY']).optional().or(z.literal('')),
});

export const passwordChangeSchema = z
  .object({
    current_password: z.string().min(1, 'Current password is required'),
    new_password: passwordSchema,
    confirm_new_password: z.string(),
  })
  .refine((d) => d.new_password === d.confirm_new_password, {
    path: ['confirm_new_password'],
    message: 'Passwords do not match',
  });

// ─── Password strength meter ─────────────────────────────────────────
/**
 * Returns { score: 0..4, label: 'weak'|'fair'|'good'|'strong', checks: {...} }
 * Used by the password input to render the live strength bar.
 */
export function evaluatePassword(pwd = '') {
  if (!pwd) return { score: 0, label: 'weak', checks: {} };
  const checks = {
    length: pwd.length >= 8,
    upper: /[A-Z]/.test(pwd),
    lower: /[a-z]/.test(pwd),
    digit: /[0-9]/.test(pwd),
    symbol: /[^A-Za-z0-9]/.test(pwd),
  };
  const passed = Object.values(checks).filter(Boolean).length;
  let score = 0;
  let label = 'weak';
  if (passed >= 5) {
    score = 4;
    label = 'strong';
  } else if (passed >= 4) {
    score = 3;
    label = 'good';
  } else if (passed >= 3) {
    score = 2;
    label = 'fair';
  } else if (passed >= 2) {
    score = 1;
    label = 'weak';
  } else {
    score = 0;
    label = 'weak';
  }
  return { score, label, checks };
}