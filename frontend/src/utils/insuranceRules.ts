export type UserRole = 'customer' | 'admin';

export type ApplicationStatus = 'Pending' | 'Approved' | 'Rejected';
export type ClaimStatus = 'Pending' | 'Under Review' | 'Approved' | 'Rejected';
export type PaymentMethod = 'Card' | 'Bank ACH' | 'UPI';

export interface PolicyRecord {
  policy_id: number;
  policy_name: string;
  category: string;
  description: string;
  premium_amount: number;
  coverage_amount: number;
  term_months: number;
  highlights: string;
  created_at?: string;
}

export interface ApplicationRecord {
  application_id: number;
  user_id: number;
  policy_id: number;
  applicant_age: number;
  nominee_name: string;
  medical_notes: string;
  application_date: string;
  status: ApplicationStatus;
  admin_notes?: string;
  policy_name?: string;
  category?: string;
  premium_amount?: number;
  coverage_amount?: number;
  term_months?: number;
  customer_name?: string;
  customer_email?: string;
  customer_phone?: string;
}

export interface ClaimRecord {
  claim_id: number;
  application_id: number;
  claim_amount: number;
  hospital_name: string;
  incident_date: string;
  claim_details: string;
  claim_date: string;
  status: ClaimStatus;
  reviewer_notes?: string;
  policy_name?: string;
  coverage_amount?: number;
  customer_name?: string;
  customer_email?: string;
}

export interface PaymentRecord {
  payment_id: number;
  application_id: number;
  user_id: number;
  amount: number;
  payment_method: PaymentMethod;
  account_mask: string;
  transaction_ref: string;
  payment_date: string;
  status: 'Paid';
  policy_name?: string;
  category?: string;
  coverage_amount?: number;
  customer_name?: string;
}

export interface NotificationRecord {
  notification_id: number;
  user_id: number;
  title: string;
  message: string;
  channel: 'In-App' | 'Email' | 'SMS';
  is_read: number;
  created_at: string;
}

export interface AuditLogRecord {
  log_id: number;
  actor_user_id: number | null;
  actor_name: string;
  actor_role: string;
  action: string;
  target_type: string;
  target_id: string;
  details: string;
  created_at: string;
}

export interface PartnerHospitalRecord {
  hospital_id: number;
  hospital_name: string;
  city: string;
  specialty: string;
  cashless_desk: number;
  emergency_phone: string;
}

export interface ClaimNoteRecord {
  note_id: number;
  claim_id: number;
  author_name: string;
  author_role: UserRole;
  title: string;
  body: string;
  tags: string;
  created_at: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: Record<string, string>;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[+\d][\d\s-]{7,18}$/;

export function validateRegistrationInput(input: {
  full_name: string;
  email: string;
  phone: string;
  password: string;
}): ValidationResult {
  const errors: Record<string, string> = {};

  if (!input.full_name || input.full_name.trim().length < 2) {
    errors.full_name = 'Full name must be at least 2 characters.';
  }
  if (!input.email || !EMAIL_RE.test(input.email.trim())) {
    errors.email = 'Enter a valid email address.';
  }
  if (!input.phone || !PHONE_RE.test(input.phone.trim())) {
    errors.phone = 'Enter a valid contact phone number (8-19 digits).';
  }
  if (!input.password || input.password.length < 6) {
    errors.password = 'Password must be at least 6 characters.';
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

export function validatePolicyInput(input: {
  policy_name: string;
  category: string;
  description: string;
  premium_amount: number;
  coverage_amount: number;
  term_months: number;
}): ValidationResult {
  const errors: Record<string, string> = {};

  if (!input.policy_name || input.policy_name.trim().length < 3) {
    errors.policy_name = 'Policy name must be at least 3 characters.';
  }
  if (!input.category || input.category.trim().length < 2) {
    errors.category = 'Select or enter a policy category.';
  }
  if (!input.description || input.description.trim().length < 15) {
    errors.description = 'Description must be at least 15 characters.';
  }
  if (!Number.isFinite(input.premium_amount) || input.premium_amount <= 0) {
    errors.premium_amount = 'Monthly premium must be greater than zero.';
  }
  if (!Number.isFinite(input.coverage_amount) || input.coverage_amount < input.premium_amount) {
    errors.coverage_amount = 'Coverage limit must be at least equal to the monthly premium.';
  }
  if (!Number.isFinite(input.term_months) || input.term_months < 1 || input.term_months > 360) {
    errors.term_months = 'Term must be between 1 and 360 months.';
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

export function validateApplicationInput(input: {
  policy_id: number;
  applicant_age: number;
  nominee_name: string;
}): ValidationResult {
  const errors: Record<string, string> = {};

  if (!Number.isInteger(input.policy_id) || input.policy_id <= 0) {
    errors.policy_id = 'Select a valid insurance policy.';
  }
  if (!Number.isFinite(input.applicant_age) || input.applicant_age < 18 || input.applicant_age > 99) {
    errors.applicant_age = 'Primary applicant age must be between 18 and 99.';
  }
  if (!input.nominee_name || input.nominee_name.trim().length < 2) {
    errors.nominee_name = 'Nominee full name is required.';
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

export function validateClaimInput(
  input: {
    application_id: number;
    claim_amount: number;
    hospital_name: string;
    incident_date: string;
    claim_details: string;
  },
  linkedApplication?: { status: ApplicationStatus; coverage_amount: number },
  todayIso: string = new Date().toISOString().slice(0, 10)
): ValidationResult {
  const errors: Record<string, string> = {};

  if (!Number.isInteger(input.application_id) || input.application_id <= 0) {
    errors.application_id = 'Select an active policy application.';
  } else if (linkedApplication) {
    if (linkedApplication.status !== 'Approved') {
      errors.application_id = 'Claims can only be filed against Approved policies.';
    }
    if (
      Number.isFinite(input.claim_amount) &&
      input.claim_amount > linkedApplication.coverage_amount
    ) {
      errors.claim_amount = `Claim amount cannot exceed policy coverage (${formatCurrency(
        linkedApplication.coverage_amount
      )}).`;
    }
  }

  if (!Number.isFinite(input.claim_amount) || input.claim_amount <= 0) {
    errors.claim_amount = 'Claim amount must be greater than zero.';
  }
  if (!input.hospital_name || input.hospital_name.trim().length < 3) {
    errors.hospital_name = 'Hospital or clinic name is required.';
  }
  if (!input.incident_date || !/^\d{4}-\d{2}-\d{2}$/.test(input.incident_date)) {
    errors.incident_date = 'Enter a valid treatment date.';
  } else if (input.incident_date > todayIso) {
    errors.incident_date = 'Treatment date cannot be in the future.';
  }
  if (!input.claim_details || input.claim_details.trim().length < 15) {
    errors.claim_details = 'Provide at least 15 characters describing the treatment or diagnosis.';
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

export function validateInquiryInput(input: {
  full_name: string;
  email: string;
  phone: string;
  preferred_category: string;
}): ValidationResult {
  const errors: Record<string, string> = {};

  if (!input.full_name || input.full_name.trim().length < 2) {
    errors.full_name = 'Please enter your name.';
  }
  if (!input.email || !EMAIL_RE.test(input.email.trim())) {
    errors.email = 'Please enter a valid email address.';
  }
  if (!input.phone || !PHONE_RE.test(input.phone.trim())) {
    errors.phone = 'Please enter a valid phone number.';
  }
  if (!input.preferred_category || input.preferred_category.trim().length < 2) {
    errors.preferred_category = 'Choose a coverage category.';
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

export function validatePaymentInput(input: {
  application_id: number;
  amount: number;
  payment_method: PaymentMethod;
  account_identifier: string;
}): ValidationResult {
  const errors: Record<string, string> = {};
  const allowedMethods: PaymentMethod[] = ['Card', 'Bank ACH', 'UPI'];

  if (!Number.isInteger(input.application_id) || input.application_id <= 0) {
    errors.application_id = 'Select an approved policy to pay.';
  }
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    errors.amount = 'Payment amount must be greater than zero.';
  }
  if (!allowedMethods.includes(input.payment_method)) {
    errors.payment_method = 'Select a valid payment method.';
  }
  const idClean = input.account_identifier.trim();
  if (input.payment_method === 'Card') {
    const digits = idClean.replace(/\D/g, '');
    if (digits.length < 12 || digits.length > 19) {
      errors.account_identifier = 'Enter a valid 12-19 digit demo card number.';
    }
  } else if (input.payment_method === 'Bank ACH') {
    if (idClean.length < 6) {
      errors.account_identifier = 'Enter at least 6 characters for the bank account reference.';
    }
  } else if (input.payment_method === 'UPI') {
    if (!idClean.includes('@') || idClean.length < 5) {
      errors.account_identifier = 'Enter a valid UPI ID (e.g., name@bank).';
    }
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

export function maskAccountIdentifier(
  method: PaymentMethod,
  identifier: string
): string {
  const trimmed = identifier.trim();
  if (method === 'Card') {
    const digits = trimmed.replace(/\D/g, '');
    return `Card •••• ${digits.slice(-4) || '0000'}`;
  }
  if (method === 'Bank ACH') {
    return `ACH •••• ${trimmed.slice(-4)}`;
  }
  return `UPI (${trimmed})`;
}

export function calculateEstimatedPremium(
  baseMonthlyPremium: number,
  age: number,
  members: number
): number {
  const safeAge = Math.min(99, Math.max(18, Math.round(age || 30)));
  const safeMembers = Math.min(6, Math.max(1, Math.round(members || 1)));
  let ageFactor = 1;
  if (safeAge >= 60) ageFactor = 1.45;
  else if (safeAge >= 45) ageFactor = 1.22;
  else if (safeAge >= 35) ageFactor = 1.08;

  const memberFactor = 1 + (safeMembers - 1) * 0.42;
  return Math.round(baseMonthlyPremium * ageFactor * memberFactor);
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
  }).format(amount);
}

export function computeCustomerSummary(
  applications: ApplicationRecord[],
  claims: ClaimRecord[]
) {
  const approvedApps = applications.filter((a) => a.status === 'Approved');
  const pendingApps = applications.filter((a) => a.status === 'Pending');
  const totalCoverage = approvedApps.reduce(
    (sum, a) => sum + (Number(a.coverage_amount) || 0),
    0
  );
  const monthlyPremium = approvedApps.reduce(
    (sum, a) => sum + (Number(a.premium_amount) || 0),
    0
  );
  const openClaims = claims.filter(
    (c) => c.status === 'Pending' || c.status === 'Under Review'
  );
  const approvedClaimTotal = claims
    .filter((c) => c.status === 'Approved')
    .reduce((sum, c) => sum + (Number(c.claim_amount) || 0), 0);

  return {
    activePoliciesCount: approvedApps.length,
    pendingApplicationsCount: pendingApps.length,
    totalCoverage,
    monthlyPremium,
    openClaimsCount: openClaims.length,
    approvedClaimTotal,
  };
}

export function computeAdminAnalytics(
  policies: PolicyRecord[],
  applications: ApplicationRecord[],
  claims: ClaimRecord[],
  payments: PaymentRecord[]
) {
  const categoryMap = new Map<
    string,
    { category: string; policyCount: number; applicationCount: number; approvedCount: number }
  >();

  for (const p of policies) {
    const entry = categoryMap.get(p.category) ?? {
      category: p.category,
      policyCount: 0,
      applicationCount: 0,
      approvedCount: 0,
    };
    entry.policyCount += 1;
    categoryMap.set(p.category, entry);
  }

  for (const app of applications) {
    const cat = app.category || 'Uncategorized';
    const entry = categoryMap.get(cat) ?? {
      category: cat,
      policyCount: 0,
      applicationCount: 0,
      approvedCount: 0,
    };
    entry.applicationCount += 1;
    if (app.status === 'Approved') entry.approvedCount += 1;
    categoryMap.set(cat, entry);
  }

  const totalCollectedPremium = payments.reduce(
    (sum, p) => sum + (Number(p.amount) || 0),
    0
  );
  const totalApprovedClaimPayout = claims
    .filter((c) => c.status === 'Approved')
    .reduce((sum, c) => sum + (Number(c.claim_amount) || 0), 0);
  const totalClaimRequested = claims.reduce(
    (sum, c) => sum + (Number(c.claim_amount) || 0),
    0
  );

  const appStatusCounts = {
    Pending: applications.filter((a) => a.status === 'Pending').length,
    Approved: applications.filter((a) => a.status === 'Approved').length,
    Rejected: applications.filter((a) => a.status === 'Rejected').length,
  };

  const claimStatusCounts = {
    Pending: claims.filter((c) => c.status === 'Pending').length,
    'Under Review': claims.filter((c) => c.status === 'Under Review').length,
    Approved: claims.filter((c) => c.status === 'Approved').length,
    Rejected: claims.filter((c) => c.status === 'Rejected').length,
  };

  return {
    byCategory: Array.from(categoryMap.values()).sort(
      (a, b) => b.applicationCount - a.applicationCount
    ),
    appStatusCounts,
    claimStatusCounts,
    totalCollectedPremium,
    totalApprovedClaimPayout,
    totalClaimRequested,
    totalPaymentsCount: payments.length,
  };
}

export function getClaimProgress(status: ClaimStatus): {
  percent: number;
  stageIndex: number;
  barClass: string;
} {
  switch (status) {
    case 'Pending':
      return { percent: 25, stageIndex: 1, barClass: 'bg-[#F59E0B]' };
    case 'Under Review':
      return { percent: 60, stageIndex: 2, barClass: 'bg-[#2563EB]' };
    case 'Approved':
      return { percent: 100, stageIndex: 4, barClass: 'bg-[#10B981]' };
    case 'Rejected':
      return { percent: 100, stageIndex: 4, barClass: 'bg-[#EF4444]' };
    default:
      return { percent: 25, stageIndex: 1, barClass: 'bg-[#F59E0B]' };
  }
}

export function validateClaimNoteInput(input: {
  title: string;
  body: string;
}): ValidationResult {
  const errors: Record<string, string> = {};
  if (!input.title || input.title.trim().length < 3) {
    errors.title = 'Note title must be at least 3 characters.';
  }
  if (!input.body || input.body.trim().length < 5) {
    errors.body = 'Note details must be at least 5 characters.';
  }
  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

export interface ClaimsBillSummary {
  totalClaimsCount: number;
  totalClaimedAmount: number;
  approvedSettledAmount: number;
  pendingReviewAmount: number;
  rejectedAmount: number;
}

export function computeClaimsBillSummary(claims: ClaimRecord[]): ClaimsBillSummary {
  let totalClaimedAmount = 0;
  let approvedSettledAmount = 0;
  let pendingReviewAmount = 0;
  let rejectedAmount = 0;

  for (const c of claims) {
    const amt = Number(c.claim_amount) || 0;
    totalClaimedAmount += amt;
    if (c.status === 'Approved') {
      approvedSettledAmount += amt;
    } else if (c.status === 'Rejected') {
      rejectedAmount += amt;
    } else {
      pendingReviewAmount += amt;
    }
  }

  return {
    totalClaimsCount: claims.length,
    totalClaimedAmount,
    approvedSettledAmount,
    pendingReviewAmount,
    rejectedAmount,
  };
}
