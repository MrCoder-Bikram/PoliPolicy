import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  Activity,
  Bell,
  Building2,
  CheckCircle2,
  ClipboardList,
  CreditCard,
  Download,
  Eye,
  FileCheck2,
  Home,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Menu,
  Plus,
  Search,
  Shield,
  ShieldCheck,
  X,
} from 'lucide-react';
import { api, ApiError, type UserProfile } from '../services/api';
import {
  computeClaimsBillSummary,
  computeCustomerSummary,
  formatCurrency,
  getClaimProgress,
  validateApplicationInput,
  validateClaimInput,
  validatePaymentInput,
  type ApplicationRecord,
  type ClaimRecord,
  type NotificationRecord,
  type PartnerHospitalRecord,
  type PaymentMethod,
  type PaymentRecord,
  type PolicyRecord,
} from '../utils/insuranceRules';
import { downloadDocument } from '../utils/receiptGenerator';
import { ClaimInspectorModal } from './ClaimInspectorModal';
import { StatusIndicator } from './StatusIndicator';

type CustomerTab =
  | 'overview'
  | 'plans'
  | 'applications'
  | 'claims'
  | 'payments'
  | 'notifications'
  | 'hospitals'
  | 'security';

interface CustomerPortalProps {
  user: UserProfile;
  policies: PolicyRecord[];
  initialPreselectedPolicyId?: number | null;
  onClearPreselectedPolicy: () => void;
  onGoHome: () => void;
  onLogout: () => void;
}

function getPlanTopBarColor(category: string): string {
  switch (category) {
    case 'Individual Health':
      return 'bg-[#2563EB]';
    case 'Family Floater':
      return 'bg-[#059669]';
    case 'Senior Care':
      return 'bg-[#4F46E5]';
    case 'Critical Illness':
      return 'bg-[#E11D48]';
    case 'Maternity & Newborn':
      return 'bg-[#D97706]';
    case 'Preventive Care':
      return 'bg-[#0D9488]';
    default:
      return 'bg-[#2563EB]';
  }
}

export function CustomerPortal({
  user,
  policies,
  initialPreselectedPolicyId,
  onClearPreselectedPolicy,
  onGoHome,
  onLogout,
}: CustomerPortalProps) {
  const [activeTab, setActiveTab] = useState<CustomerTab>(
    initialPreselectedPolicyId ? 'plans' : 'overview'
  );
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [applications, setApplications] = useState<ApplicationRecord[]>([]);
  const [claims, setClaims] = useState<ClaimRecord[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [hospitals, setHospitals] = useState<PartnerHospitalRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [bannerMessage, setBannerMessage] = useState('');

  // Claim Inspector Modal
  const [inspectingClaim, setInspectingClaim] = useState<ClaimRecord | null>(null);

  // Plans search & filter
  const [planSearch, setPlanSearch] = useState('');
  const [planCategory, setPlanCategory] = useState('All');

  // Application Modal State
  const [applyPolicy, setApplyPolicy] = useState<PolicyRecord | null>(null);
  const [applicantAge, setApplicantAge] = useState('32');
  const [nomineeName, setNomineeName] = useState('');
  const [medicalNotes, setMedicalNotes] = useState('');
  const [applySubmitting, setApplySubmitting] = useState(false);
  const [applyError, setApplyError] = useState('');
  const [applyFieldErrors, setApplyFieldErrors] = useState<Record<string, string>>({});

  // Filters
  const [appStatusFilter, setAppStatusFilter] = useState('All');
  const [claimStatusFilter, setClaimStatusFilter] = useState('All');
  const [hospitalSearch, setHospitalSearch] = useState('');

  // Claim Form State
  const [claimAppId, setClaimAppId] = useState<string>('');
  const [claimAmount, setClaimAmount] = useState('');
  const [hospitalName, setHospitalName] = useState('');
  const [incidentDate, setIncidentDate] = useState(new Date().toISOString().slice(0, 10));
  const [claimDetails, setClaimDetails] = useState('');
  const [claimSubmitting, setClaimSubmitting] = useState(false);
  const [claimError, setClaimError] = useState('');
  const [claimFieldErrors, setClaimFieldErrors] = useState<Record<string, string>>({});

  // Payment Form State
  const [payAppId, setPayAppId] = useState<string>('');
  const [payMethod, setPayMethod] = useState<PaymentMethod>('Card');
  const [payIdentifier, setPayIdentifier] = useState('');
  const [paySubmitting, setPaySubmitting] = useState(false);
  const [payError, setPayError] = useState('');
  const [payFieldErrors, setPayFieldErrors] = useState<Record<string, string>>({});

  // Password Security State
  const [currPassword, setCurrPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwSaving, setPwSaving] = useState(false);
  const [pwError, setPwError] = useState('');

  async function loadCustomerData() {
    setLoading(true);
    setLoadError('');
    try {
      const [appsRes, claimsRes, payRes, notifRes, hospRes] = await Promise.all([
        api.getApplications(),
        api.getClaims(),
        api.getPayments(),
        api.getNotifications(),
        api.getHospitals(),
      ]);
      setApplications(appsRes.applications ?? []);
      setClaims(claimsRes.claims ?? []);
      setPayments(payRes.payments ?? []);
      setNotifications(notifRes.notifications ?? []);
      setUnreadCount(Number(notifRes.unreadCount ?? 0));
      setHospitals(hospRes.hospitals ?? []);
    } catch (err) {
      setLoadError(
        err instanceof ApiError ? err.message : 'Failed to load your portal records.'
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadCustomerData();
  }, []);

  useEffect(() => {
    if (initialPreselectedPolicyId && policies.length > 0) {
      const match = policies.find((p) => p.policy_id === initialPreselectedPolicyId);
      if (match) {
        setActiveTab('plans');
        setApplyPolicy(match);
        onClearPreselectedPolicy();
      }
    }
  }, [initialPreselectedPolicyId, policies, onClearPreselectedPolicy]);

  const approvedApplications = useMemo(
    () => applications.filter((a) => a.status === 'Approved'),
    [applications]
  );

  useEffect(() => {
    if (!claimAppId && approvedApplications.length > 0) {
      setClaimAppId(String(approvedApplications[0].application_id));
    }
    if (!payAppId && approvedApplications.length > 0) {
      setPayAppId(String(approvedApplications[0].application_id));
    }
  }, [approvedApplications, claimAppId, payAppId]);

  const summary = useMemo(
    () => computeCustomerSummary(applications, claims),
    [applications, claims]
  );

  const claimsBillSummary = useMemo(
    () => computeClaimsBillSummary(claims),
    [claims]
  );

  const policyCategories = useMemo(
    () => ['All', ...Array.from(new Set(policies.map((p) => p.category)))],
    [policies]
  );

  const filteredPolicies = useMemo(() => {
    const q = planSearch.trim().toLowerCase();
    return policies.filter((p) => {
      const catMatch = planCategory === 'All' || p.category === planCategory;
      const qMatch =
        !q ||
        (p.policy_name || '').toLowerCase().includes(q) ||
        (p.description || '').toLowerCase().includes(q) ||
        (p.category || '').toLowerCase().includes(q);
      return catMatch && qMatch;
    });
  }, [policies, planCategory, planSearch]);

  const filteredApplications = useMemo(
    () =>
      applications.filter(
        (a) => appStatusFilter === 'All' || a.status === appStatusFilter
      ),
    [applications, appStatusFilter]
  );

  const filteredClaims = useMemo(
    () =>
      claims.filter(
        (c) => claimStatusFilter === 'All' || c.status === claimStatusFilter
      ),
    [claims, claimStatusFilter]
  );

  const filteredHospitals = useMemo(() => {
    const q = hospitalSearch.trim().toLowerCase();
    if (!q) return hospitals;
    return hospitals.filter(
      (h) =>
        (h.hospital_name || '').toLowerCase().includes(q) ||
        (h.city || '').toLowerCase().includes(q) ||
        (h.specialty || '').toLowerCase().includes(q)
    );
  }, [hospitals, hospitalSearch]);

  const selectedPayApp = useMemo(
    () => approvedApplications.find((a) => String(a.application_id) === payAppId),
    [approvedApplications, payAppId]
  );

  async function refreshNotifications() {
    const res = await api.getNotifications().catch(() => null);
    if (res) {
      setNotifications(res.notifications);
      setUnreadCount(res.unreadCount);
    }
  }

  async function handleApplicationSubmit(e: FormEvent) {
    e.preventDefault();
    if (!applyPolicy) return;
    setApplyError('');
    setApplyFieldErrors({});

    const check = validateApplicationInput({
      policy_id: applyPolicy.policy_id,
      applicant_age: Number(applicantAge),
      nominee_name: nomineeName,
    });
    if (!check.valid) {
      setApplyFieldErrors(check.errors);
      setApplyError(Object.values(check.errors)[0]);
      return;
    }

    setApplySubmitting(true);
    try {
      const res = await api.submitApplication({
        policy_id: applyPolicy.policy_id,
        applicant_age: Number(applicantAge),
        nominee_name: nomineeName.trim(),
        medical_notes: medicalNotes.trim(),
      });
      setApplications((prev) => [res.application, ...prev]);
      setApplyPolicy(null);
      setNomineeName('');
      setMedicalNotes('');
      setBannerMessage(
        `Application submitted for ${res.application.policy_name}. Current status: Pending.`
      );
      setActiveTab('applications');
      refreshNotifications();
    } catch (err) {
      if (err instanceof ApiError) {
        setApplyError(err.message);
        if (err.errors) setApplyFieldErrors(err.errors);
      } else {
        setApplyError('Failed to submit application.');
      }
    } finally {
      setApplySubmitting(false);
    }
  }

  async function handleClaimSubmit(e: FormEvent) {
    e.preventDefault();
    setClaimError('');
    setClaimFieldErrors({});

    const selectedApp = approvedApplications.find(
      (a) => String(a.application_id) === claimAppId
    );
    const check = validateClaimInput(
      {
        application_id: Number(claimAppId),
        claim_amount: Number(claimAmount),
        hospital_name: hospitalName,
        incident_date: incidentDate,
        claim_details: claimDetails,
      },
      selectedApp
        ? {
            status: selectedApp.status,
            coverage_amount: Number(selectedApp.coverage_amount) || 0,
          }
        : undefined
    );

    if (!check.valid) {
      setClaimFieldErrors(check.errors);
      setClaimError(Object.values(check.errors)[0]);
      return;
    }

    setClaimSubmitting(true);
    try {
      const res = await api.submitClaim({
        application_id: Number(claimAppId),
        claim_amount: Number(claimAmount),
        hospital_name: hospitalName.trim(),
        incident_date: incidentDate,
        claim_details: claimDetails.trim(),
      });
      setClaims((prev) => [res.claim, ...prev]);
      setClaimAmount('');
      setHospitalName('');
      setClaimDetails('');
      setBannerMessage(
        `Claim #${res.claim.claim_id} submitted for ${res.claim.policy_name}.`
      );
      refreshNotifications();
    } catch (err) {
      if (err instanceof ApiError) {
        setClaimError(err.message);
        if (err.errors) setClaimFieldErrors(err.errors);
      } else {
        setClaimError('Failed to submit claim.');
      }
    } finally {
      setClaimSubmitting(false);
    }
  }

  async function handlePaymentSubmit(e: FormEvent) {
    e.preventDefault();
    setPayError('');
    setPayFieldErrors({});

    const amount = Number(selectedPayApp?.premium_amount ?? 0);
    const check = validatePaymentInput({
      application_id: Number(payAppId),
      amount,
      payment_method: payMethod,
      account_identifier: payIdentifier,
    });
    if (!check.valid) {
      setPayFieldErrors(check.errors);
      setPayError(Object.values(check.errors)[0]);
      return;
    }

    setPaySubmitting(true);
    try {
      const res = await api.submitPayment({
        application_id: Number(payAppId),
        amount,
        payment_method: payMethod,
        account_identifier: payIdentifier.trim(),
      });
      setPayments((prev) => [res.payment, ...prev]);
      setPayIdentifier('');
      setBannerMessage(
        `Payment ${res.payment.transaction_ref} recorded (${formatCurrency(
          res.payment.amount
        )}).`
      );
      refreshNotifications();
    } catch (err) {
      if (err instanceof ApiError) {
        setPayError(err.message);
        if (err.errors) setPayFieldErrors(err.errors);
      } else {
        setPayError('Payment recording failed.');
      }
    } finally {
      setPaySubmitting(false);
    }
  }

  async function handleMarkRead(id: number) {
    await api.markNotificationRead(id).catch(() => {});
    setNotifications((prev) =>
      prev.map((n) => (n.notification_id === id ? { ...n, is_read: 1 } : n))
    );
    setUnreadCount((c) => Math.max(0, c - 1));
  }

  async function handleMarkAllRead() {
    await api.markAllNotificationsRead().catch(() => {});
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: 1 })));
    setUnreadCount(0);
  }

  async function handleChangePassword(e: FormEvent) {
    e.preventDefault();
    setPwError('');
    if (!currPassword || newPassword.length < 6) {
      setPwError('Enter your current password and a new password of at least 6 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwError('New password and confirmation do not match.');
      return;
    }

    setPwSaving(true);
    try {
      const res = await api.changePassword({
        current_password: currPassword,
        new_password: newPassword,
      });
      setCurrPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setBannerMessage(res.message);
      refreshNotifications();
    } catch (err) {
      setPwError(err instanceof ApiError ? err.message : 'Unable to update password.');
    } finally {
      setPwSaving(false);
    }
  }

  function handleDownloadApplicationReceipt(app: ApplicationRecord) {
    downloadDocument({
      filename: `PoliPolicy-Policy-Application-${app.application_id}.html`,
      title: 'Policy Application & Coverage Summary',
      subtitle: `Issued for ${user.full_name} (${user.email})`,
      referenceId: `APP-${app.application_id}`,
      rows: [
        { label: 'Policy Plan', value: app.policy_name || `Policy #${app.policy_id}` },
        { label: 'Category', value: app.category || 'Health Coverage' },
        { label: 'Application Status', value: app.status },
        { label: 'Monthly Premium', value: formatCurrency(app.premium_amount || 0) },
        { label: 'Annual Coverage Limit', value: formatCurrency(app.coverage_amount || 0) },
        { label: 'Primary Applicant Age', value: String(app.applicant_age) },
        { label: 'Designated Nominee', value: app.nominee_name },
        { label: 'Application Date', value: app.application_date },
        {
          label: 'Underwriter Remarks',
          value: app.admin_notes || 'Pending administrative review',
        },
      ],
    });
  }

  function handleDownloadClaimStatement(claim: ClaimRecord) {
    downloadDocument({
      filename: `PoliPolicy-Claim-Statement-${claim.claim_id}.html`,
      title: 'Medical Claim Statement',
      subtitle: `Member: ${user.full_name}`,
      referenceId: `CLM-${claim.claim_id}`,
      rows: [
        { label: 'Linked Policy', value: claim.policy_name || 'Health Policy' },
        { label: 'Hospital / Clinic', value: claim.hospital_name },
        { label: 'Treatment Date', value: claim.incident_date },
        { label: 'Claimed Amount', value: formatCurrency(claim.claim_amount) },
        { label: 'Submitted Date', value: claim.claim_date },
        { label: 'Current Status', value: claim.status },
        { label: 'Diagnosis / Summary', value: claim.claim_details },
        {
          label: 'Claims Reviewer Notes',
          value: claim.reviewer_notes || 'Awaiting claims evaluation',
        },
      ],
    });
  }

  function handleDownloadPaymentInvoice(pay: PaymentRecord) {
    downloadDocument({
      filename: `PoliPolicy-Invoice-${pay.transaction_ref}.html`,
      title: 'Premium Payment Receipt',
      subtitle: `Paid by ${user.full_name} (${user.email})`,
      referenceId: pay.transaction_ref,
      rows: [
        { label: 'Policy Plan', value: pay.policy_name || `Application #${pay.application_id}` },
        { label: 'Amount Paid', value: formatCurrency(pay.amount) },
        { label: 'Payment Method', value: pay.payment_method },
        { label: 'Account Reference', value: pay.account_mask },
        { label: 'Payment Date', value: pay.payment_date },
        { label: 'Payment Status', value: pay.status },
      ],
      footerNote:
        'Demo payment receipt recorded by PoliPolicy. No live financial charge was processed.',
    });
  }

  function handleDownloadAllClaimsBill() {
    const today = new Date().toISOString().slice(0, 10);
    downloadDocument({
      filename: `PoliPolicy-All-Claims-Bill-${today}.html`,
      title: 'Claims Billing & Settlement Statement',
      subtitle: `Member: ${user.full_name} (${user.email})`,
      referenceId: `BILL-${today.replaceAll('-', '')}`,
      rows: [
        { label: 'Statement Date', value: today },
        { label: 'Total Submitted Claims', value: String(claimsBillSummary.totalClaimsCount) },
        {
          label: 'Total Claimed Amount',
          value: formatCurrency(claimsBillSummary.totalClaimedAmount),
        },
        {
          label: 'Approved & Settled Bill',
          value: formatCurrency(claimsBillSummary.approvedSettledAmount),
        },
        {
          label: 'Pending / Under Review',
          value: formatCurrency(claimsBillSummary.pendingReviewAmount),
        },
        {
          label: 'Declined / Rejected',
          value: formatCurrency(claimsBillSummary.rejectedAmount),
        },
      ],
      tableSection: {
        heading: 'Itemized Claims Schedule',
        columns: [
          'Claim ID',
          'Policy Plan',
          'Hospital / Clinic',
          'Treatment Date',
          'Amount',
          'Status',
          'Reviewer Notes',
        ],
        rows: claims.map((c) => [
          `CLM-${c.claim_id}`,
          c.policy_name || `Application #${c.application_id}`,
          c.hospital_name,
          c.incident_date,
          formatCurrency(c.claim_amount),
          c.status,
          c.reviewer_notes || 'Pending evaluation',
        ]),
      },
      footerNote:
        'Generated by PoliPolicy Billing Desk. Itemized summary of all medical claims submitted under your account.',
    });
  }

  const navItems: Array<{
    id: CustomerTab;
    label: string;
    icon: typeof LayoutDashboard;
    count?: number;
  }> = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'plans', label: 'Browse Plans', icon: Shield },
    { id: 'applications', label: 'My Applications', icon: ClipboardList },
    { id: 'claims', label: 'My Claims', icon: FileCheck2 },
    { id: 'payments', label: 'Payments & Billing', icon: CreditCard },
    { id: 'notifications', label: 'Notifications', icon: Bell, count: unreadCount },
    { id: 'hospitals', label: 'Partner Hospitals', icon: Building2 },
    { id: 'security', label: 'Account Security', icon: KeyRound },
  ];

  const tabTitles: Record<CustomerTab, string> = {
    overview: 'Overview',
    plans: 'Policy Catalogue',
    applications: 'Policy Applications',
    claims: 'Claims & Reimbursement',
    payments: 'Premium Payments & Invoices',
    notifications: 'Notification Center',
    hospitals: 'Partner Hospital Directory',
    security: 'Password & Account Security',
  };

  return (
    <div className="min-h-screen bg-[#f7f5ee] text-[#17261f] flex pb-16 lg:pb-0">
      {/* Deep Royal Navy Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 bg-[#18342b] text-white flex flex-col justify-between shadow-[0_20px_60px_rgba(24,52,43,0.2)] transition-transform lg:static lg:translate-x-0 ${
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div>
          <div className="h-16 px-6 flex items-center justify-between border-b border-white/10">
            <button
              type="button"
              onClick={onGoHome}
              className="flex items-center gap-2.5 font-display text-lg font-bold tracking-tight text-white"
            >
              <span className="w-7 h-7 rounded-full bg-[#d7ed78] flex items-center justify-center text-[#18342b] text-xs font-black">
                P.
              </span>
              <span>PoliPolicy</span>
            </button>
            <button
              type="button"
              aria-label="Close navigation menu"
              onClick={() => setMobileMenuOpen(false)}
              className="lg:hidden p-1.5 text-[#94A3B8] hover:text-white"
            >
              <X className="w-5 h-5" aria-hidden="true" />
            </button>
          </div>

          <div className="px-4 py-5">
            <p className="px-3 text-[10px] font-bold uppercase tracking-[0.18em] text-[#c5d5b6] mb-3">Your coverage</p>
            <nav aria-label="Member navigation" className="space-y-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setActiveTab(item.id);
                      setMobileMenuOpen(false);
                    }}
                    className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
                      active
                        ? 'bg-[#d7ed78] text-[#18342b] shadow-sm'
                        : 'text-[#d5dfd5] hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    <span className="flex items-center gap-3 min-w-0">
                      <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                      <span className="truncate">{item.label}</span>
                    </span>
                    {typeof item.count === 'number' && item.count > 0 && (
                      <span className="font-mono text-xs font-semibold text-[#93C5FD] tabular-nums">
                        {item.count}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>
          </div>
        </div>

        <div className="p-4 border-t border-white/10 space-y-1.5">
          <div className="px-3 py-2">
            <p className="text-sm font-semibold text-white truncate">{user.full_name}</p>
            <p className="text-xs text-[#94A3B8] truncate">{user.email}</p>
          </div>
          <button
            type="button"
            onClick={onGoHome}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-[#CBD5E1] hover:text-white hover:bg-white/10 rounded-lg transition-colors"
          >
            <Home className="w-4 h-4" aria-hidden="true" />
            <span>Landing Home</span>
          </button>
          <button
            type="button"
            onClick={onLogout}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-[#FDA4AF] hover:bg-white/10 rounded-lg transition-colors"
          >
            <LogOut className="w-4 h-4" aria-hidden="true" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="h-16 bg-[#fbfaf6] border-b border-[#e4e6d9] px-4 sm:px-6 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              aria-label="Open navigation menu"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 -ml-1 text-[#475569] hover:text-[#0F172A]"
            >
              <Menu className="w-5 h-5" aria-hidden="true" />
            </button>
            <p className="text-sm text-[#64748B] truncate max-w-[165px] sm:max-w-none">
              <span className="hidden sm:inline">Member Portal</span>
              <span className="hidden sm:inline mx-2" aria-hidden="true">
                /
              </span>
              <span className="font-semibold text-[#0E1A40]">{tabTitles[activeTab]}</span>
            </p>
          </div>

          <button
            type="button"
            onClick={() => setActiveTab('plans')}
            className="inline-flex items-center gap-2 rounded-full bg-[#18342b] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#294d3f] whitespace-nowrap shrink-0 sm:text-sm"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            <span>Apply for Policy</span>
          </button>
        </header>

        <main className="flex-1 p-5 sm:p-6 lg:p-9 max-w-6xl w-full mx-auto space-y-7">
          {bannerMessage && (
            <div
              role="status"
              className="p-4 bg-[#ECFDF5] border border-[#A7F3D0] rounded-xl flex items-center justify-between gap-4 text-sm text-[#047857]"
            >
              <span>{bannerMessage}</span>
              <button
                type="button"
                aria-label="Dismiss notification"
                onClick={() => setBannerMessage('')}
                className="p-1 hover:bg-[#D1FAE5] rounded"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
          )}

          {loadError && (
            <div
              role="alert"
              className="p-4 bg-[#FFF1F2] border border-[#FECDD3] rounded-xl text-sm text-[#BE123C] flex flex-wrap items-center justify-between gap-3"
            >
              <span>{loadError}</span>
              <button
                type="button"
                onClick={loadCustomerData}
                className="px-3 py-1.5 bg-white border border-[#FECDD3] hover:bg-[#FFE4E6] text-xs font-semibold text-[#9F1239] rounded-lg transition-colors"
              >
                Retry Loading
              </button>
            </div>
          )}

          {/* OVERVIEW TAB */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              <div>
                <h1 className="font-display text-2xl font-bold text-[#0E1A40]">
                  Welcome back, {(user.full_name || 'Member').split(' ')[0]}
                </h1>
                <p className="mt-1 text-sm text-[#475569]">
                  Review your active coverage limits, policy application progress, premium
                  payments, and medical claim statuses.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white border border-[#E2E8F0] rounded-xl p-5">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium text-[#64748B]">Active Policies</p>
                    <span className="w-8 h-8 rounded-lg bg-[#EFF6FF] text-[#2563EB] flex items-center justify-center">
                      <ShieldCheck className="w-4 h-4" aria-hidden="true" />
                    </span>
                  </div>
                  <p className="mt-2 font-mono text-2xl font-semibold text-[#0E1A40] tabular-nums">
                    {summary.activePoliciesCount}
                  </p>
                  <p className="mt-1 text-xs text-[#475569] tabular-nums">
                    {summary.pendingApplicationsCount} pending review
                  </p>
                </div>

                <div className="bg-white border border-[#E2E8F0] rounded-xl p-5">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium text-[#64748B]">Total Active Coverage</p>
                    <span className="w-8 h-8 rounded-lg bg-[#ECFDF5] text-[#059669] flex items-center justify-center">
                      <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
                    </span>
                  </div>
                  <p className="mt-2 font-mono text-2xl font-semibold text-[#059669] tabular-nums">
                    {formatCurrency(summary.totalCoverage)}
                  </p>
                  <p className="mt-1 text-xs text-[#475569] tabular-nums">
                    {formatCurrency(summary.monthlyPremium)} / mo total premium
                  </p>
                </div>

                <div className="bg-white border border-[#E2E8F0] rounded-xl p-5">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium text-[#64748B]">Open Claims</p>
                    <span className="w-8 h-8 rounded-lg bg-[#FFFBEB] text-[#D97706] flex items-center justify-center">
                      <Activity className="w-4 h-4" aria-hidden="true" />
                    </span>
                  </div>
                  <p className="mt-2 font-mono text-2xl font-semibold text-[#D97706] tabular-nums">
                    {summary.openClaimsCount}
                  </p>
                  <p className="mt-1 text-xs text-[#475569]">Pending or Under Review</p>
                </div>

                <div className="bg-white border border-[#E2E8F0] rounded-xl p-5">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium text-[#64748B]">Settled Claim Value</p>
                    <span className="w-8 h-8 rounded-lg bg-[#EEF2FF] text-[#4F46E5] flex items-center justify-center">
                      <FileCheck2 className="w-4 h-4" aria-hidden="true" />
                    </span>
                  </div>
                  <p className="mt-2 font-mono text-2xl font-semibold text-[#4F46E5] tabular-nums">
                    {formatCurrency(summary.approvedClaimTotal)}
                  </p>
                  <p className="mt-1 text-xs text-[#475569]">Approved reimbursements</p>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <section className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
                  <div className="px-5 py-4 border-b border-[#E2E8F0] flex items-center justify-between">
                    <h2 className="font-display text-base font-bold text-[#0E1A40]">
                      Recent Applications
                    </h2>
                    <button
                      type="button"
                      onClick={() => setActiveTab('applications')}
                      className="text-xs font-semibold text-[#2563EB] hover:underline"
                    >
                      View All
                    </button>
                  </div>
                  {loading ? (
                    <div className="p-6 text-sm text-[#64748B]">Loading applications...</div>
                  ) : applications.length === 0 ? (
                    <div className="p-6 text-sm text-[#64748B]">
                      No applications yet.{' '}
                      <button
                        type="button"
                        onClick={() => setActiveTab('plans')}
                        className="text-[#2563EB] font-semibold hover:underline"
                      >
                        Browse health plans
                      </button>
                    </div>
                  ) : (
                    <div className="divide-y divide-[#F1F5F9]">
                      {applications.slice(0, 4).map((app) => (
                        <div
                          key={app.application_id}
                          className="px-5 py-3.5 flex items-center justify-between gap-4 hover:bg-[#F8FAFC]"
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-[#0F172A] truncate">
                              {app.policy_name}
                            </p>
                            <p className="text-xs text-[#64748B] tabular-nums">
                              Applied {app.application_date} · Nominee: {app.nominee_name}
                            </p>
                          </div>
                          <StatusIndicator status={app.status} />
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                <section className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
                  <div className="px-5 py-4 border-b border-[#E2E8F0] flex items-center justify-between">
                    <h2 className="font-display text-base font-bold text-[#0E1A40]">
                      Recent Claims
                    </h2>
                    <button
                      type="button"
                      onClick={() => setActiveTab('claims')}
                      className="text-xs font-semibold text-[#2563EB] hover:underline"
                    >
                      Manage Claims
                    </button>
                  </div>
                  {loading ? (
                    <div className="p-6 text-sm text-[#64748B]">Loading claims...</div>
                  ) : claims.length === 0 ? (
                    <div className="p-6 text-sm text-[#64748B]">
                      No medical claims filed yet.
                    </div>
                  ) : (
                    <div className="divide-y divide-[#F1F5F9]">
                      {claims.slice(0, 4).map((claim) => (
                        <div
                          key={claim.claim_id}
                          className="px-5 py-3.5 flex items-center justify-between gap-4 hover:bg-[#F8FAFC]"
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-[#0F172A] truncate">
                              {claim.hospital_name}
                            </p>
                            <p className="text-xs text-[#64748B] tabular-nums">
                              {formatCurrency(claim.claim_amount)} · {claim.policy_name}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <StatusIndicator status={claim.status} />
                            <button
                              type="button"
                              aria-label={`Inspect claim #${claim.claim_id}`}
                              onClick={() => setInspectingClaim(claim)}
                              className="p-1.5 text-[#475569] hover:text-[#2563EB] hover:bg-[#EFF6FF] rounded-md transition-colors"
                            >
                              <Eye className="w-4 h-4" aria-hidden="true" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </div>
            </div>
          )}

          {/* BROWSE PLANS TAB */}
          {activeTab === 'plans' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h1 className="font-display text-2xl font-bold text-[#0E1A40]">
                    Available Health Plans
                  </h1>
                  <p className="mt-1 text-sm text-[#475569]">
                    Select a policy below to submit an application for administrative approval.
                  </p>
                </div>
                <div className="relative w-full sm:w-64">
                  <Search
                    className="w-4 h-4 text-[#64748B] absolute left-3 top-1/2 -translate-y-1/2"
                    aria-hidden="true"
                  />
                  <input
                    type="search"
                    aria-label="Filter policy plans"
                    value={planSearch}
                    onChange={(e) => setPlanSearch(e.target.value)}
                    placeholder="Search plans..."
                    className="w-full pl-9 pr-3 py-2 bg-white border border-[#CBD5E1] rounded-lg text-sm focus:outline-none focus:border-[#2563EB]"
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5 p-1 bg-[#E2E8F0] rounded-lg w-fit max-w-full">
                {policyCategories.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setPlanCategory(cat)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                      planCategory === cat
                        ? 'bg-white text-[#0E1A40] shadow-xs'
                        : 'text-[#475569] hover:text-[#0E1A40]'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {filteredPolicies.map((policy) => (
                  <article
                    key={policy.policy_id}
                    className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden flex flex-col justify-between"
                  >
                    <div className={`h-1.5 w-full ${getPlanTopBarColor(policy.category)}`} />
                    <div className="p-5 flex-1 flex flex-col justify-between">
                      <div>
                        <p className="text-xs font-medium text-[#64748B]">
                          {policy.category} · {policy.term_months} mo
                        </p>
                        <h2 className="mt-1.5 font-display text-lg font-bold text-[#0E1A40]">
                          {policy.policy_name}
                        </h2>
                        <div className="mt-3 flex items-baseline justify-between border-b border-[#F1F5F9] pb-3">
                          <span className="font-mono text-xl font-semibold text-[#0E1A40] tabular-nums">
                            {formatCurrency(policy.premium_amount)}
                            <span className="text-xs font-normal text-[#64748B]">/mo</span>
                          </span>
                          <span className="font-mono text-xs font-semibold text-[#059669] tabular-nums">
                            Limit {formatCurrency(policy.coverage_amount)}
                          </span>
                        </div>
                        <p className="mt-3 text-sm text-[#475569] leading-relaxed">
                          {policy.description}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setApplyPolicy(policy);
                          setApplyError('');
                          setApplyFieldErrors({});
                        }}
                        className="mt-5 w-full py-2.5 px-4 bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-sm font-semibold rounded-lg transition-colors whitespace-nowrap"
                      >
                        Apply Now
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          )}

          {/* MY APPLICATIONS TAB */}
          {activeTab === 'applications' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h1 className="font-display text-2xl font-bold text-[#0E1A40]">
                    My Policy Applications
                  </h1>
                  <p className="mt-1 text-sm text-[#475569]">
                    Track submission dates, approval decisions, and download policy summaries.
                  </p>
                </div>

                <div className="flex items-center gap-1 p-1 bg-[#E2E8F0] rounded-lg w-fit">
                  {['All', 'Pending', 'Approved', 'Rejected'].map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setAppStatusFilter(st)}
                      className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                        appStatusFilter === st
                          ? 'bg-white text-[#0E1A40] shadow-xs'
                          : 'text-[#475569] hover:text-[#0E1A40]'
                      }`}
                    >
                      {st}
                    </button>
                  ))}
                </div>
              </div>

              <div className="bg-white border border-[#E2E8F0] rounded-xl overflow-x-auto">
                {filteredApplications.length === 0 ? (
                  <div className="p-8 text-center">
                    <p className="text-sm font-medium text-[#0F172A]">
                      No applications found for this filter.
                    </p>
                    <button
                      type="button"
                      onClick={() => setActiveTab('plans')}
                      className="mt-3 px-4 py-2 bg-[#2563EB] text-white text-xs font-semibold rounded-lg hover:bg-[#1D4ED8]"
                    >
                      Browse Policies
                    </button>
                  </div>
                ) : (
                  <table className="w-full text-left border-collapse min-w-[820px]">
                    <thead>
                      <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC] text-xs font-semibold text-[#475569]">
                        <th className="py-3 px-4">ID</th>
                        <th className="py-3 px-4">Policy</th>
                        <th className="py-3 px-4">Nominee</th>
                        <th className="py-3 px-4 text-right">Premium</th>
                        <th className="py-3 px-4 text-right">Coverage</th>
                        <th className="py-3 px-4">Submitted</th>
                        <th className="py-3 px-4">Status</th>
                        <th className="py-3 px-4 text-right">Receipt</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#F1F5F9] text-sm">
                      {filteredApplications.map((app) => (
                        <tr key={app.application_id} className="hover:bg-[#F8FAFC]">
                          <td className="py-3 px-4 font-mono text-xs text-[#64748B] tabular-nums">
                            #{app.application_id}
                          </td>
                          <td className="py-3 px-4">
                            <p className="font-medium text-[#0F172A]">{app.policy_name}</p>
                            {app.admin_notes && (
                              <p className="text-xs text-[#64748B] max-w-xs truncate">
                                {app.admin_notes}
                              </p>
                            )}
                          </td>
                          <td className="py-3 px-4 text-[#475569]">{app.nominee_name}</td>
                          <td className="py-3 px-4 text-right font-mono tabular-nums">
                            {formatCurrency(app.premium_amount || 0)}
                          </td>
                          <td className="py-3 px-4 text-right font-mono tabular-nums font-medium text-[#059669]">
                            {formatCurrency(app.coverage_amount || 0)}
                          </td>
                          <td className="py-3 px-4 font-mono text-xs text-[#475569] tabular-nums">
                            {app.application_date}
                          </td>
                          <td className="py-3 px-4">
                            <StatusIndicator status={app.status} />
                          </td>
                          <td className="py-3 px-4 text-right">
                            <button
                              type="button"
                              aria-label={`Download receipt for application #${app.application_id}`}
                              onClick={() => handleDownloadApplicationReceipt(app)}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-[#0E1A40] bg-[#EFF6FF] hover:bg-[#2563EB] hover:text-white rounded-md transition-colors whitespace-nowrap"
                            >
                              <Download className="w-3.5 h-3.5" aria-hidden="true" />
                              <span>Summary</span>
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}

          {/* MY CLAIMS TAB */}
          {activeTab === 'claims' && (
            <div className="space-y-6">
              <div>
                <h1 className="font-display text-2xl font-bold text-[#0E1A40]">
                  Medical Claims
                </h1>
                <p className="mt-1 text-sm text-[#475569]">
                  Submit reimbursement requests against approved policies, inspect claim stages
                  and case notes, and download claim statements.
                </p>
              </div>

              <section className="bg-white border border-[#E2E8E0] rounded-xl p-6">
                <h2 className="font-display text-lg font-bold text-[#0E1A40]">
                  Submit a Claim Request
                </h2>

                {approvedApplications.length === 0 ? (
                  <div className="mt-4 p-4 bg-[#FFFBEB] border border-[#FDE68A] rounded-lg text-sm text-[#92400E]">
                    You need at least one <strong>Approved</strong> policy application before
                    filing a claim.{' '}
                    <button
                      type="button"
                      onClick={() => setActiveTab('plans')}
                      className="underline font-semibold ml-1"
                    >
                      Apply for a policy
                    </button>
                  </div>
                ) : (
                  <form
                    onSubmit={handleClaimSubmit}
                    noValidate
                    className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4"
                  >
                    {claimError && (
                      <div
                        role="alert"
                        className="md:col-span-2 p-3.5 bg-[#FFF1F2] border border-[#FECDD3] rounded-lg text-sm text-[#BE123C]"
                      >
                        {claimError}
                      </div>
                    )}

                    <div>
                      <label
                        htmlFor="claim-policy"
                        className="block text-sm font-medium text-[#1E293B] mb-1.5"
                      >
                        Approved Policy
                      </label>
                      <select
                        id="claim-policy"
                        value={claimAppId}
                        onChange={(e) => setClaimAppId(e.target.value)}
                        className="w-full px-3.5 py-2.5 bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-sm focus:bg-white focus:outline-none focus:border-[#2563EB]"
                      >
                        {approvedApplications.map((app) => (
                          <option key={app.application_id} value={app.application_id}>
                            #{app.application_id} — {app.policy_name} (Limit{' '}
                            {formatCurrency(app.coverage_amount || 0)})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label
                        htmlFor="claim-amount"
                        className="block text-sm font-medium text-[#1E293B] mb-1.5"
                      >
                        Claim Amount (USD)
                      </label>
                      <input
                        id="claim-amount"
                        type="number"
                        min="1"
                        step="0.01"
                        value={claimAmount}
                        onChange={(e) => setClaimAmount(e.target.value)}
                        placeholder="1250"
                        className="w-full px-3.5 py-2.5 bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-sm font-mono tabular-nums focus:bg-white focus:outline-none focus:border-[#2563EB]"
                      />
                      {claimFieldErrors.claim_amount && (
                        <p className="mt-1 text-xs text-[#BE123C]">
                          {claimFieldErrors.claim_amount}
                        </p>
                      )}
                    </div>

                    <div>
                      <label
                        htmlFor="claim-hospital"
                        className="block text-sm font-medium text-[#1E293B] mb-1.5"
                      >
                        Hospital / Clinic Name
                      </label>
                      <input
                        id="claim-hospital"
                        type="text"
                        value={hospitalName}
                        onChange={(e) => setHospitalName(e.target.value)}
                        placeholder="Pacific Coast Medical Center"
                        className="w-full px-3.5 py-2.5 bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-sm focus:bg-white focus:outline-none focus:border-[#2563EB]"
                      />
                      {claimFieldErrors.hospital_name && (
                        <p className="mt-1 text-xs text-[#BE123C]">
                          {claimFieldErrors.hospital_name}
                        </p>
                      )}
                    </div>

                    <div>
                      <label
                        htmlFor="claim-date"
                        className="block text-sm font-medium text-[#1E293B] mb-1.5"
                      >
                        Treatment / Incident Date
                      </label>
                      <input
                        id="claim-date"
                        type="date"
                        value={incidentDate}
                        onChange={(e) => setIncidentDate(e.target.value)}
                        className="w-full px-3.5 py-2.5 bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-sm font-mono focus:bg-white focus:outline-none focus:border-[#2563EB]"
                      />
                      {claimFieldErrors.incident_date && (
                        <p className="mt-1 text-xs text-[#BE123C]">
                          {claimFieldErrors.incident_date}
                        </p>
                      )}
                    </div>

                    <div className="md:col-span-2">
                      <label
                        htmlFor="claim-details"
                        className="block text-sm font-medium text-[#1E293B] mb-1.5"
                      >
                        Diagnosis &amp; Treatment Details
                      </label>
                      <textarea
                        id="claim-details"
                        rows={3}
                        value={claimDetails}
                        onChange={(e) => setClaimDetails(e.target.value)}
                        placeholder="Describe treatment, procedures, or invoice summary (minimum 15 characters)..."
                        className="w-full px-3.5 py-2.5 bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-sm focus:bg-white focus:outline-none focus:border-[#2563EB]"
                      />
                      {claimFieldErrors.claim_details && (
                        <p className="mt-1 text-xs text-[#BE123C]">
                          {claimFieldErrors.claim_details}
                        </p>
                      )}
                    </div>

                    <div className="md:col-span-2 flex justify-end">
                      <button
                        type="submit"
                        disabled={claimSubmitting}
                        className="px-5 py-2.5 bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-60 text-white text-sm font-semibold rounded-lg transition-colors whitespace-nowrap"
                      >
                        {claimSubmitting ? 'Submitting Claim...' : 'Submit Claim Request'}
                      </button>
                    </div>
                  </form>
                )}
              </section>

              <div className="space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <h2 className="font-display text-lg font-bold text-[#0E1A40]">
                    Submitted Claims History
                  </h2>
                  <div className="flex flex-wrap gap-1 p-1 bg-[#E2E8F0] rounded-lg w-fit">
                    {['All', 'Pending', 'Under Review', 'Approved', 'Rejected'].map((st) => (
                      <button
                        key={st}
                        type="button"
                        onClick={() => setClaimStatusFilter(st)}
                        className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                          claimStatusFilter === st
                            ? 'bg-white text-[#0E1A40] shadow-xs'
                            : 'text-[#475569] hover:text-[#0E1A40]'
                        }`}
                      >
                        {st}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="bg-white border border-[#E2E8F0] rounded-xl overflow-x-auto">
                  {filteredClaims.length === 0 ? (
                    <div className="p-8 text-center text-sm text-[#64748B]">
                      No claims match this status filter.
                    </div>
                  ) : (
                    <table className="w-full text-left border-collapse min-w-[940px]">
                      <thead>
                        <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC] text-xs font-semibold text-[#475569]">
                          <th className="py-3 px-4">Claim ID</th>
                          <th className="py-3 px-4">Policy</th>
                          <th className="py-3 px-4">Hospital / Clinic</th>
                          <th className="py-3 px-4 text-right">Amount</th>
                          <th className="py-3 px-4">Progress</th>
                          <th className="py-3 px-4">Status</th>
                          <th className="py-3 px-4 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#F1F5F9] text-sm">
                        {filteredClaims.map((claim) => {
                          const progress = getClaimProgress(claim.status);
                          return (
                            <tr key={claim.claim_id} className="hover:bg-[#F8FAFC]">
                              <td className="py-3 px-4 font-mono text-xs text-[#64748B] tabular-nums">
                                #{claim.claim_id}
                              </td>
                              <td className="py-3 px-4">
                                <p className="font-medium text-[#0F172A]">
                                  {claim.policy_name}
                                </p>
                                <p className="text-xs font-mono text-[#64748B] tabular-nums">
                                  Filed {claim.claim_date}
                                </p>
                              </td>
                              <td className="py-3 px-4 text-[#475569]">
                                {claim.hospital_name}
                              </td>
                              <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-[#0E1A40]">
                                {formatCurrency(claim.claim_amount)}
                              </td>
                              <td className="py-3 px-4">
                                <div className="flex items-center gap-2.5 min-w-[130px]">
                                  <div className="flex-1 h-2 bg-[#E2E8F0] rounded-full overflow-hidden">
                                    <div
                                      className={`h-full rounded-full ${progress.barClass}`}
                                      style={{ width: `${progress.percent}%` }}
                                    />
                                  </div>
                                  <span className="font-mono text-xs text-[#475569] tabular-nums w-9 text-right">
                                    {progress.percent}%
                                  </span>
                                </div>
                              </td>
                              <td className="py-3 px-4">
                                <StatusIndicator status={claim.status} />
                              </td>
                              <td className="py-3 px-4 text-right">
                                <div className="inline-flex items-center gap-2">
                                  <button
                                    type="button"
                                    aria-label={`Inspect claim #${claim.claim_id}`}
                                    onClick={() => setInspectingClaim(claim)}
                                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-[#2563EB] bg-[#EFF6FF] hover:bg-[#2563EB] hover:text-white rounded-md transition-colors whitespace-nowrap"
                                  >
                                    <Eye className="w-3.5 h-3.5" aria-hidden="true" />
                                    <span>Inspect</span>
                                  </button>
                                  <button
                                    type="button"
                                    aria-label={`Download statement for claim #${claim.claim_id}`}
                                    onClick={() => handleDownloadClaimStatement(claim)}
                                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-[#0E1A40] bg-[#F1F5F9] hover:bg-[#0E1A40] hover:text-white rounded-md transition-colors whitespace-nowrap"
                                  >
                                    <Download className="w-3.5 h-3.5" aria-hidden="true" />
                                    <span>Statement</span>
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* PAYMENTS & BILLING TAB */}
          {activeTab === 'payments' && (
            <div className="space-y-6">
              <div>
                <h1 className="font-display text-2xl font-bold text-[#0E1A40]">
                  Premium Payments &amp; Billing
                </h1>
                <p className="mt-1 text-sm text-[#475569]">
                  Record monthly premium payments in this controlled demo checkout and download
                  payment invoices.
                </p>
              </div>

              <section className="bg-white border border-[#E2E8F0] rounded-xl p-6">
                <h2 className="font-display text-lg font-bold text-[#0E1A40]">
                  Pay Policy Premium (Demo Gateway)
                </h2>
                {approvedApplications.length === 0 ? (
                  <div className="mt-4 p-4 bg-[#FFFBEB] border border-[#FDE68A] rounded-lg text-sm text-[#92400E]">
                    Premium payments become available once an application is Approved.
                  </div>
                ) : (
                  <form
                    onSubmit={handlePaymentSubmit}
                    noValidate
                    className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4"
                  >
                    {payError && (
                      <div
                        role="alert"
                        className="md:col-span-3 p-3.5 bg-[#FFF1F2] border border-[#FECDD3] rounded-lg text-sm text-[#BE123C]"
                      >
                        {payError}
                      </div>
                    )}

                    <div>
                      <label
                        htmlFor="pay-policy"
                        className="block text-sm font-medium text-[#1E293B] mb-1.5"
                      >
                        Approved Policy
                      </label>
                      <select
                        id="pay-policy"
                        value={payAppId}
                        onChange={(e) => setPayAppId(e.target.value)}
                        className="w-full px-3.5 py-2.5 bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-sm focus:bg-white focus:outline-none focus:border-[#2563EB]"
                      >
                        {approvedApplications.map((app) => (
                          <option key={app.application_id} value={app.application_id}>
                            {app.policy_name} — {formatCurrency(app.premium_amount || 0)}/mo
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label
                        htmlFor="pay-method"
                        className="block text-sm font-medium text-[#1E293B] mb-1.5"
                      >
                        Payment Method
                      </label>
                      <select
                        id="pay-method"
                        value={payMethod}
                        onChange={(e) => setPayMethod(e.target.value as PaymentMethod)}
                        className="w-full px-3.5 py-2.5 bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-sm focus:bg-white focus:outline-none focus:border-[#2563EB]"
                      >
                        <option value="Card">Debit / Credit Card</option>
                        <option value="Bank ACH">Bank ACH Transfer</option>
                        <option value="UPI">UPI Handle</option>
                      </select>
                    </div>

                    <div>
                      <label
                        htmlFor="pay-account"
                        className="block text-sm font-medium text-[#1E293B] mb-1.5"
                      >
                        {payMethod === 'Card'
                          ? 'Demo Card Number'
                          : payMethod === 'Bank ACH'
                          ? 'Bank Account Reference'
                          : 'UPI ID'}
                      </label>
                      <input
                        id="pay-account"
                        type="text"
                        value={payIdentifier}
                        onChange={(e) => setPayIdentifier(e.target.value)}
                        placeholder={
                          payMethod === 'Card'
                            ? '4242 4242 4242 4242'
                            : payMethod === 'Bank ACH'
                            ? 'ACCT-889021'
                            : 'aarav@okbank'
                        }
                        className="w-full px-3.5 py-2.5 bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-sm font-mono focus:bg-white focus:outline-none focus:border-[#2563EB]"
                      />
                      {payFieldErrors.account_identifier && (
                        <p className="mt-1 text-xs text-[#BE123C]">
                          {payFieldErrors.account_identifier}
                        </p>
                      )}
                    </div>

                    <div className="md:col-span-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
                      <p className="text-xs text-[#64748B]">
                        Due amount:{' '}
                        <strong className="font-mono text-sm text-[#0E1A40] tabular-nums">
                          {formatCurrency(selectedPayApp?.premium_amount ?? 0)}
                        </strong>{' '}
                        (Academic sandbox — no real charge)
                      </p>
                      <button
                        type="submit"
                        disabled={paySubmitting}
                        className="px-5 py-2.5 bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-60 text-white text-sm font-semibold rounded-lg transition-colors whitespace-nowrap"
                      >
                        {paySubmitting ? 'Recording Payment...' : 'Record Premium Payment'}
                      </button>
                    </div>
                  </form>
                )}
              </section>

              <div className="bg-white border border-[#E2E8F0] rounded-xl overflow-x-auto">
                {payments.length === 0 ? (
                  <div className="p-8 text-center text-sm text-[#64748B]">
                    No premium payments recorded yet.
                  </div>
                ) : (
                  <table className="w-full text-left border-collapse min-w-[740px]">
                    <thead>
                      <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC] text-xs font-semibold text-[#475569]">
                        <th className="py-3 px-4">Transaction Ref</th>
                        <th className="py-3 px-4">Policy</th>
                        <th className="py-3 px-4">Method</th>
                        <th className="py-3 px-4 text-right">Amount</th>
                        <th className="py-3 px-4">Date</th>
                        <th className="py-3 px-4 text-right">Invoice</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#F1F5F9] text-sm">
                      {payments.map((pay) => (
                        <tr key={pay.payment_id} className="hover:bg-[#F8FAFC]">
                          <td className="py-3 px-4 font-mono text-xs text-[#2563EB] font-medium">
                            {pay.transaction_ref}
                          </td>
                          <td className="py-3 px-4 font-medium text-[#0F172A]">
                            {pay.policy_name}
                          </td>
                          <td className="py-3 px-4 text-xs text-[#475569]">
                            {pay.account_mask}
                          </td>
                          <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-[#059669]">
                            {formatCurrency(pay.amount)}
                          </td>
                          <td className="py-3 px-4 font-mono text-xs text-[#475569] tabular-nums">
                            {pay.payment_date}
                          </td>
                          <td className="py-3 px-4 text-right">
                            <button
                              type="button"
                              aria-label={`Download invoice ${pay.transaction_ref}`}
                              onClick={() => handleDownloadPaymentInvoice(pay)}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-[#0E1A40] bg-[#EFF6FF] hover:bg-[#2563EB] hover:text-white rounded-md transition-colors whitespace-nowrap"
                            >
                              <Download className="w-3.5 h-3.5" aria-hidden="true" />
                              <span>Invoice</span>
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* CLAIMS BILLING & SETTLEMENT STATEMENT */}
              <section className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
                <div className="px-6 py-5 border-b border-[#E2E8F0] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h2 className="font-display text-lg font-bold text-[#0E1A40]">
                      Claims Billing &amp; Settlement Statement
                    </h2>
                    <p className="mt-0.5 text-xs text-[#475569]">
                      Consolidated bill listing every submitted medical claim, settlement status,
                      and downloadable statement.
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={claims.length === 0}
                    onClick={handleDownloadAllClaimsBill}
                    className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#0E1A40] hover:bg-[#2563EB] disabled:opacity-50 text-white text-xs sm:text-sm font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0"
                  >
                    <Download className="w-4 h-4" aria-hidden="true" />
                    <span>Download All Claims Bill</span>
                  </button>
                </div>

                <div className="grid grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-[#E2E8F0] bg-[#F8FAFC] border-b border-[#E2E8F0]">
                  <div className="p-4">
                    <p className="text-xs text-[#64748B]">Total Claims Filed</p>
                    <p className="mt-1 font-mono text-lg font-bold text-[#0E1A40] tabular-nums">
                      {claimsBillSummary.totalClaimsCount}
                    </p>
                  </div>
                  <div className="p-4">
                    <p className="text-xs text-[#64748B]">Total Claimed Amount</p>
                    <p className="mt-1 font-mono text-lg font-bold text-[#0E1A40] tabular-nums">
                      {formatCurrency(claimsBillSummary.totalClaimedAmount)}
                    </p>
                  </div>
                  <div className="p-4">
                    <p className="text-xs text-[#64748B]">Approved &amp; Settled Bill</p>
                    <p className="mt-1 font-mono text-lg font-bold text-[#059669] tabular-nums">
                      {formatCurrency(claimsBillSummary.approvedSettledAmount)}
                    </p>
                  </div>
                  <div className="p-4">
                    <p className="text-xs text-[#64748B]">Pending / In Review</p>
                    <p className="mt-1 font-mono text-lg font-bold text-[#D97706] tabular-nums">
                      {formatCurrency(claimsBillSummary.pendingReviewAmount)}
                    </p>
                  </div>
                </div>

                {claims.length === 0 ? (
                  <div className="p-8 text-center text-sm text-[#64748B]">
                    No medical claims have been billed yet.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse min-w-[780px]">
                      <thead>
                        <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC] text-xs font-semibold text-[#475569]">
                          <th className="py-3 px-4">Claim ID</th>
                          <th className="py-3 px-4">Policy &amp; Hospital</th>
                          <th className="py-3 px-4">Treatment Date</th>
                          <th className="py-3 px-4">Status</th>
                          <th className="py-3 px-4 text-right">Billed Amount</th>
                          <th className="py-3 px-4 text-right">Bill Copy</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#F1F5F9] text-sm">
                        {claims.map((claim) => (
                          <tr key={claim.claim_id} className="hover:bg-[#F8FAFC]">
                            <td className="py-3 px-4 font-mono text-xs text-[#2563EB] font-semibold tabular-nums">
                              CLM-{claim.claim_id}
                            </td>
                            <td className="py-3 px-4">
                              <p className="font-medium text-[#0F172A]">
                                {claim.policy_name || `Application #${claim.application_id}`}
                              </p>
                              <p className="text-xs text-[#64748B]">{claim.hospital_name}</p>
                            </td>
                            <td className="py-3 px-4 font-mono text-xs text-[#475569] tabular-nums">
                              {claim.incident_date}
                            </td>
                            <td className="py-3 px-4">
                              <StatusIndicator status={claim.status} />
                            </td>
                            <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-[#0E1A40]">
                              {formatCurrency(claim.claim_amount)}
                            </td>
                            <td className="py-3 px-4 text-right">
                              <button
                                type="button"
                                aria-label={`Download bill for claim #${claim.claim_id}`}
                                onClick={() => handleDownloadClaimStatement(claim)}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-[#0E1A40] bg-[#EFF6FF] hover:bg-[#2563EB] hover:text-white rounded-md transition-colors whitespace-nowrap"
                              >
                                <Download className="w-3.5 h-3.5" aria-hidden="true" />
                                <span>Download Bill</span>
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </div>
          )}

          {/* NOTIFICATIONS TAB */}
          {activeTab === 'notifications' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h1 className="font-display text-2xl font-bold text-[#0E1A40]">
                    Notification Center
                  </h1>
                  <p className="mt-1 text-sm text-[#475569]">
                    Automated email, SMS, and portal alerts for application, claim, and billing
                    updates.
                  </p>
                </div>
                {unreadCount > 0 && (
                  <button
                    type="button"
                    onClick={handleMarkAllRead}
                    className="px-4 py-2 text-xs font-semibold text-[#0E1A40] bg-white border border-[#CBD5E1] hover:border-[#2563EB] rounded-lg whitespace-nowrap"
                  >
                    Mark All Read
                  </button>
                )}
              </div>

              <div className="bg-white border border-[#E2E8F0] rounded-xl divide-y divide-[#F1F5F9]">
                {notifications.length === 0 ? (
                  <div className="p-8 text-center text-sm text-[#64748B]">
                    No notifications yet.
                  </div>
                ) : (
                  notifications.map((n) => (
                    <div
                      key={n.notification_id}
                      className={`p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                        n.is_read === 0 ? 'bg-[#EFF6FF]/60' : 'bg-white'
                      }`}
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 text-xs text-[#64748B]">
                          <span>{n.channel} Alert</span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono tabular-nums">
                            {String(n.created_at ?? '').slice(0, 10) || '—'}
                          </span>
                          {n.is_read === 0 && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="font-semibold text-[#2563EB]">Unread</span>
                            </>
                          )}
                        </div>
                        <p className="text-sm font-semibold text-[#0E1A40]">{n.title}</p>
                        <p className="text-sm text-[#475569]">{n.message}</p>
                      </div>
                      {n.is_read === 0 && (
                        <button
                          type="button"
                          onClick={() => handleMarkRead(n.notification_id)}
                          className="px-3 py-1.5 text-xs font-semibold text-[#2563EB] hover:underline whitespace-nowrap shrink-0"
                        >
                          Mark read
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* PARTNER HOSPITALS TAB */}
          {activeTab === 'hospitals' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h1 className="font-display text-2xl font-bold text-[#0E1A40]">
                    Partner Hospital Network
                  </h1>
                  <p className="mt-1 text-sm text-[#475569]">
                    Participating hospitals and diagnostic clinics with verified cashless desks.
                  </p>
                </div>
                <div className="relative w-full sm:w-64">
                  <Search
                    className="w-4 h-4 text-[#64748B] absolute left-3 top-1/2 -translate-y-1/2"
                    aria-hidden="true"
                  />
                  <input
                    type="search"
                    aria-label="Search partner hospitals"
                    value={hospitalSearch}
                    onChange={(e) => setHospitalSearch(e.target.value)}
                    placeholder="City, hospital, specialty..."
                    className="w-full pl-9 pr-3 py-2 bg-white border border-[#CBD5E1] rounded-lg text-sm focus:outline-none focus:border-[#2563EB]"
                  />
                </div>
              </div>

              <div className="bg-white border border-[#E2E8F0] rounded-xl overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[640px]">
                  <thead>
                    <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC] text-xs font-semibold text-[#475569]">
                      <th className="py-3 px-4">Hospital / Clinic</th>
                      <th className="py-3 px-4">City</th>
                      <th className="py-3 px-4">Specialty</th>
                      <th className="py-3 px-4">Emergency Contact</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F1F5F9] text-sm">
                    {filteredHospitals.map((h) => (
                      <tr key={h.hospital_id} className="hover:bg-[#F8FAFC]">
                        <td className="py-3 px-4 font-semibold text-[#0E1A40]">
                          {h.hospital_name}
                        </td>
                        <td className="py-3 px-4 text-[#475569]">{h.city}</td>
                        <td className="py-3 px-4 text-[#475569]">{h.specialty}</td>
                        <td className="py-3 px-4 font-mono text-xs text-[#059669] tabular-nums">
                          {h.emergency_phone}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ACCOUNT SECURITY TAB */}
          {activeTab === 'security' && (
            <div className="space-y-6 max-w-xl">
              <div>
                <h1 className="font-display text-2xl font-bold text-[#0E1A40]">
                  Account &amp; Password Security
                </h1>
                <p className="mt-1 text-sm text-[#475569]">
                  Update your password regularly. Password updates are recorded in the security
                  audit log.
                </p>
              </div>

              <form
                onSubmit={handleChangePassword}
                noValidate
                className="bg-white border border-[#E2E8F0] rounded-xl p-6 space-y-4"
              >
                {pwError && (
                  <div
                    role="alert"
                    className="p-3.5 bg-[#FFF1F2] border border-[#FECDD3] rounded-lg text-sm text-[#BE123C]"
                  >
                    {pwError}
                  </div>
                )}

                <div>
                  <label
                    htmlFor="sec-curr-pw"
                    className="block text-sm font-medium text-[#1E293B] mb-1.5"
                  >
                    Current Password
                  </label>
                  <input
                    id="sec-curr-pw"
                    type="password"
                    value={currPassword}
                    onChange={(e) => setCurrPassword(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-sm focus:bg-white focus:outline-none focus:border-[#2563EB]"
                  />
                </div>

                <div>
                  <label
                    htmlFor="sec-new-pw"
                    className="block text-sm font-medium text-[#1E293B] mb-1.5"
                  >
                    New Password
                  </label>
                  <input
                    id="sec-new-pw"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Minimum 6 characters"
                    className="w-full px-3.5 py-2.5 bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-sm focus:bg-white focus:outline-none focus:border-[#2563EB]"
                  />
                </div>

                <div>
                  <label
                    htmlFor="sec-confirm-pw"
                    className="block text-sm font-medium text-[#1E293B] mb-1.5"
                  >
                    Confirm New Password
                  </label>
                  <input
                    id="sec-confirm-pw"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-sm focus:bg-white focus:outline-none focus:border-[#2563EB]"
                  />
                </div>

                <div className="pt-2 flex justify-end">
                  <button
                    type="submit"
                    disabled={pwSaving}
                    className="px-5 py-2.5 bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-60 text-white text-sm font-semibold rounded-lg transition-colors whitespace-nowrap"
                  >
                    {pwSaving ? 'Updating...' : 'Update Password'}
                  </button>
                </div>
              </form>
            </div>
          )}
        </main>
      </div>

      {/* Mobile Bottom Navigation Bar (< lg, <= 15% viewport height) */}
      <nav
        aria-label="Mobile quick navigation"
        className="lg:hidden fixed bottom-0 inset-x-0 z-30 h-14 bg-white border-t border-[#E2E8F0] grid grid-cols-5"
      >
        {(
          [
            { id: 'overview', label: 'Overview', icon: LayoutDashboard },
            { id: 'plans', label: 'Plans', icon: Shield },
            { id: 'applications', label: 'Apps', icon: ClipboardList },
            { id: 'claims', label: 'Claims', icon: FileCheck2 },
            { id: 'payments', label: 'Billing', icon: CreditCard },
          ] as const
        ).map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium ${
                active ? 'text-[#2563EB]' : 'text-[#64748B]'
              }`}
            >
              <Icon className="w-4 h-4" aria-hidden="true" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Policy Application Modal */}
      {applyPolicy && (
        <div
          className="fixed inset-0 z-50 bg-[#0E1A40]/55 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="apply-modal-title"
        >
          <div className="bg-white border border-[#E2E8F0] rounded-2xl max-w-lg w-full p-6 sm:p-8 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold text-[#2563EB]">{applyPolicy.category}</p>
                <h2
                  id="apply-modal-title"
                  className="mt-1 font-display text-xl font-bold text-[#0E1A40]"
                >
                  Apply for {applyPolicy.policy_name}
                </h2>
              </div>
              <button
                type="button"
                aria-label="Close application form"
                onClick={() => setApplyPolicy(null)}
                className="p-1.5 text-[#64748B] hover:text-[#0F172A] rounded-lg"
              >
                <X className="w-5 h-5" aria-hidden="true" />
              </button>
            </div>

            <div className="mt-4 p-3.5 bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg flex items-center justify-between text-sm">
              <span>
                Monthly Premium:{' '}
                <strong className="font-mono tabular-nums">
                  {formatCurrency(applyPolicy.premium_amount)}
                </strong>
              </span>
              <span>
                Coverage:{' '}
                <strong className="font-mono tabular-nums text-[#059669]">
                  {formatCurrency(applyPolicy.coverage_amount)}
                </strong>
              </span>
            </div>

            {applyError && (
              <div
                role="alert"
                className="mt-4 p-3 bg-[#FFF1F2] border border-[#FECDD3] rounded-lg text-sm text-[#BE123C]"
              >
                {applyError}
              </div>
            )}

            <form onSubmit={handleApplicationSubmit} noValidate className="mt-5 space-y-4">
              <div>
                <label
                  htmlFor="app-age"
                  className="block text-sm font-medium text-[#1E293B] mb-1.5"
                >
                  Primary Applicant Age
                </label>
                <input
                  id="app-age"
                  type="number"
                  min="18"
                  max="99"
                  value={applicantAge}
                  onChange={(e) => setApplicantAge(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-white border border-[#CBD5E1] rounded-lg text-sm font-mono tabular-nums focus:outline-none focus:border-[#2563EB]"
                />
                {applyFieldErrors.applicant_age && (
                  <p className="mt-1 text-xs text-[#BE123C]">
                    {applyFieldErrors.applicant_age}
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="app-nominee"
                  className="block text-sm font-medium text-[#1E293B] mb-1.5"
                >
                  Nominee Full Name
                </label>
                <input
                  id="app-nominee"
                  type="text"
                  value={nomineeName}
                  onChange={(e) => setNomineeName(e.target.value)}
                  placeholder="Enter beneficiary / nominee name"
                  className="w-full px-3.5 py-2.5 bg-white border border-[#CBD5E1] rounded-lg text-sm focus:outline-none focus:border-[#2563EB]"
                />
                {applyFieldErrors.nominee_name && (
                  <p className="mt-1 text-xs text-[#BE123C]">
                    {applyFieldErrors.nominee_name}
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="app-medical"
                  className="block text-sm font-medium text-[#1E293B] mb-1.5"
                >
                  Medical History / Notes (Optional)
                </label>
                <textarea
                  id="app-medical"
                  rows={3}
                  value={medicalNotes}
                  onChange={(e) => setMedicalNotes(e.target.value)}
                  placeholder="List any pre-existing conditions or leave blank if none..."
                  className="w-full px-3.5 py-2.5 bg-white border border-[#CBD5E1] rounded-lg text-sm focus:outline-none focus:border-[#2563EB]"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setApplyPolicy(null)}
                  className="px-4 py-2.5 text-sm font-medium text-[#475569] hover:text-[#0F172A]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={applySubmitting}
                  className="px-5 py-2.5 bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-60 text-white text-sm font-semibold rounded-lg transition-colors whitespace-nowrap"
                >
                  {applySubmitting ? 'Submitting...' : 'Submit Application'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Claim Inspector Modal */}
      {inspectingClaim && (
        <ClaimInspectorModal
          claim={inspectingClaim}
          role="customer"
          onClose={() => setInspectingClaim(null)}
        />
      )}
    </div>
  );
}
