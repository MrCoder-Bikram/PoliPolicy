import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  Activity,
  BarChart3,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Download,
  Eye,
  FileSpreadsheet,
  History,
  Home,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquare,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import {
  api,
  ApiError,
  type AdminAnalyticsResponse,
  type AdminOverviewResponse,
  type UserProfile,
} from '../services/api';
import {
  computeClaimsBillSummary,
  formatCurrency,
  getClaimProgress,
  validatePolicyInput,
  type ApplicationRecord,
  type ApplicationStatus,
  type AuditLogRecord,
  type ClaimRecord,
  type ClaimStatus,
  type PolicyRecord,
} from '../utils/insuranceRules';
import { downloadDocument } from '../utils/receiptGenerator';
import { ClaimInspectorModal } from './ClaimInspectorModal';
import { StatusIndicator } from './StatusIndicator';

type AdminTab =
  | 'overview'
  | 'analytics'
  | 'policies'
  | 'applications'
  | 'claims'
  | 'audit'
  | 'inquiries';

interface AdminPortalProps {
  user: UserProfile;
  policies: PolicyRecord[];
  onPoliciesChanged: (next: PolicyRecord[]) => void;
  onGoHome: () => void;
  onLogout: () => void;
}

const POLICY_CATEGORIES = [
  'Individual Health',
  'Family Floater',
  'Senior Care',
  'Critical Illness',
  'Maternity & Newborn',
  'Preventive Care',
];

function getCategoryBarColor(category: string): string {
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

function getStatusBarColor(status: string): string {
  switch (status) {
    case 'Approved':
      return 'bg-[#059669]';
    case 'Under Review':
      return 'bg-[#2563EB]';
    case 'Pending':
      return 'bg-[#D97706]';
    case 'Rejected':
      return 'bg-[#E11D48]';
    default:
      return 'bg-[#64748B]';
  }
}

export function AdminPortal({
  user,
  policies,
  onPoliciesChanged,
  onGoHome,
  onLogout,
}: AdminPortalProps) {
  const [activeTab, setActiveTab] = useState<AdminTab>('overview');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [overview, setOverview] = useState<AdminOverviewResponse | null>(null);
  const [analytics, setAnalytics] = useState<AdminAnalyticsResponse['analytics'] | null>(
    null
  );
  const [auditLogs, setAuditLogs] = useState<AuditLogRecord[]>([]);
  const [applications, setApplications] = useState<ApplicationRecord[]>([]);
  const [claims, setClaims] = useState<ClaimRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [bannerMsg, setBannerMsg] = useState('');

  // Claim Inspector Modal
  const [inspectingClaim, setInspectingClaim] = useState<ClaimRecord | null>(null);

  // Filters & search
  const [customerSearch, setCustomerSearch] = useState('');
  const [policySearch, setPolicySearch] = useState('');
  const [auditSearch, setAuditSearch] = useState('');
  const [appStatusFilter, setAppStatusFilter] = useState('All');
  const [claimStatusFilter, setClaimStatusFilter] = useState('All');

  // Policy Add/Edit Modal
  const [policyModalOpen, setPolicyModalOpen] = useState(false);
  const [editingPolicy, setEditingPolicy] = useState<PolicyRecord | null>(null);
  const [pName, setPName] = useState('');
  const [pCategory, setPCategory] = useState('Individual Health');
  const [pDescription, setPDescription] = useState('');
  const [pPremium, setPPremium] = useState('');
  const [pCoverage, setPCoverage] = useState('');
  const [pTerm, setPTerm] = useState('12');
  const [pHighlights, setPHighlights] = useState('');
  const [policySaving, setPolicySaving] = useState(false);
  const [policyFormError, setPolicyFormError] = useState('');
  const [policyFieldErrors, setPolicyFieldErrors] = useState<Record<string, string>>({});

  // Delete confirmation
  const [deletingPolicy, setDeletingPolicy] = useState<PolicyRecord | null>(null);
  const [deleteError, setDeleteError] = useState('');

  // Review modals
  const [reviewingApp, setReviewingApp] = useState<ApplicationRecord | null>(null);
  const [appNextStatus, setAppNextStatus] = useState<ApplicationStatus>('Approved');
  const [appAdminNotes, setAppAdminNotes] = useState('');
  const [reviewSaving, setReviewSaving] = useState(false);

  const [reviewingClaim, setReviewingClaim] = useState<ClaimRecord | null>(null);
  const [claimNextStatus, setClaimNextStatus] = useState<ClaimStatus>('Approved');
  const [claimReviewerNotes, setClaimReviewerNotes] = useState('');
  const [quickApprovingKey, setQuickApprovingKey] = useState<string | null>(null);

  async function loadAdminData() {
    setLoading(true);
    setErrorMsg('');
    try {
      const [ovRes, appsRes, claimsRes, anRes, logRes] = await Promise.all([
        api.getAdminOverview(),
        api.getApplications(),
        api.getClaims(),
        api.getAdminAnalytics(),
        api.getAdminAuditLogs(),
      ]);
      setOverview(ovRes);
      setApplications(appsRes.applications ?? []);
      setClaims(claimsRes.claims ?? []);
      setAnalytics(anRes.analytics ?? null);
      setAuditLogs(logRes.logs ?? []);
    } catch (err) {
      setErrorMsg(
        err instanceof ApiError ? err.message : 'Failed to load administrative records.'
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAdminData();
  }, []);

  const filteredCustomers = useMemo(() => {
    const q = customerSearch.trim().toLowerCase();
    const list = overview?.customers ?? [];
    if (!q) return list;
    return list.filter(
      (c) =>
        (c.full_name || '').toLowerCase().includes(q) ||
        (c.email || '').toLowerCase().includes(q) ||
        (c.phone || '').toLowerCase().includes(q)
    );
  }, [overview, customerSearch]);

  const filteredPolicies = useMemo(() => {
    const q = policySearch.trim().toLowerCase();
    if (!q) return policies;
    return policies.filter(
      (p) =>
        (p.policy_name || '').toLowerCase().includes(q) ||
        (p.category || '').toLowerCase().includes(q) ||
        (p.description || '').toLowerCase().includes(q)
    );
  }, [policies, policySearch]);

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

  const filteredAuditLogs = useMemo(() => {
    const q = auditSearch.trim().toLowerCase();
    if (!q) return auditLogs;
    return auditLogs.filter(
      (l) =>
        (l.actor_name || '').toLowerCase().includes(q) ||
        (l.action || '').toLowerCase().includes(q) ||
        (l.details || '').toLowerCase().includes(q)
    );
  }, [auditLogs, auditSearch]);

  function openAddPolicyModal() {
    setEditingPolicy(null);
    setPName('');
    setPCategory('Individual Health');
    setPDescription('');
    setPPremium('');
    setPCoverage('');
    setPTerm('12');
    setPHighlights('');
    setPolicyFormError('');
    setPolicyFieldErrors({});
    setPolicyModalOpen(true);
  }

  function openEditPolicyModal(policy: PolicyRecord) {
    setEditingPolicy(policy);
    setPName(policy.policy_name);
    setPCategory(policy.category);
    setPDescription(policy.description);
    setPPremium(String(policy.premium_amount));
    setPCoverage(String(policy.coverage_amount));
    setPTerm(String(policy.term_months));
    setPHighlights(policy.highlights || '');
    setPolicyFormError('');
    setPolicyFieldErrors({});
    setPolicyModalOpen(true);
  }

  function openClaimVerdictModal(claim: ClaimRecord) {
    setReviewingClaim(claim);
    setClaimNextStatus(
      claim.status === 'Pending' || claim.status === 'Under Review' ? 'Approved' : claim.status
    );
    setClaimReviewerNotes(claim.reviewer_notes || '');
  }

  async function handleSavePolicy(e: FormEvent) {
    e.preventDefault();
    setPolicyFormError('');
    setPolicyFieldErrors({});

    const payload = {
      policy_name: pName.trim(),
      category: pCategory,
      description: pDescription.trim(),
      premium_amount: Number(pPremium),
      coverage_amount: Number(pCoverage),
      term_months: Number(pTerm),
      highlights: pHighlights.trim(),
    };

    const check = validatePolicyInput(payload);
    if (!check.valid) {
      setPolicyFieldErrors(check.errors);
      setPolicyFormError(Object.values(check.errors)[0]);
      return;
    }

    setPolicySaving(true);
    try {
      if (editingPolicy) {
        const res = await api.updatePolicy(editingPolicy.policy_id, payload);
        onPoliciesChanged(
          policies.map((p) =>
            p.policy_id === editingPolicy.policy_id ? res.policy : p
          )
        );
        setBannerMsg(`Updated policy "${res.policy.policy_name}".`);
      } else {
        const res = await api.createPolicy(payload);
        onPoliciesChanged([...policies, res.policy]);
        setBannerMsg(`Created new policy "${res.policy.policy_name}".`);
      }
      setPolicyModalOpen(false);
      loadAdminData();
    } catch (err) {
      if (err instanceof ApiError) {
        setPolicyFormError(err.message);
      } else {
        setPolicyFormError('Failed to save policy.');
      }
    } finally {
      setPolicySaving(false);
    }
  }

  async function handleConfirmDeletePolicy() {
    if (!deletingPolicy) return;
    setDeleteError('');
    try {
      await api.deletePolicy(deletingPolicy.policy_id);
      onPoliciesChanged(
        policies.filter((p) => p.policy_id !== deletingPolicy.policy_id)
      );
      setBannerMsg(`Deleted policy "${deletingPolicy.policy_name}".`);
      setDeletingPolicy(null);
      loadAdminData();
    } catch (err) {
      setDeleteError(
        err instanceof ApiError ? err.message : 'Unable to delete policy.'
      );
    }
  }

  async function handleSaveApplicationReview(e: FormEvent) {
    e.preventDefault();
    if (!reviewingApp) return;
    setReviewSaving(true);
    try {
      const res = await api.updateApplicationStatus(
        reviewingApp.application_id,
        appNextStatus,
        appAdminNotes
      );
      setApplications((prev) =>
        prev.map((a) =>
          a.application_id === reviewingApp.application_id ? res.application : a
        )
      );
      setBannerMsg(
        `Application #${reviewingApp.application_id} marked ${appNextStatus}.`
      );
      setReviewingApp(null);
      loadAdminData();
    } catch (err) {
      setErrorMsg(
        err instanceof ApiError ? err.message : 'Could not update application status.'
      );
    } finally {
      setReviewSaving(false);
    }
  }

  async function handleSaveClaimReview(e: FormEvent) {
    e.preventDefault();
    if (!reviewingClaim) return;
    setReviewSaving(true);
    try {
      const res = await api.updateClaimStatus(
        reviewingClaim.claim_id,
        claimNextStatus,
        claimReviewerNotes
      );
      setClaims((prev) =>
        prev.map((c) => (c.claim_id === reviewingClaim.claim_id ? res.claim : c))
      );
      setBannerMsg(`Claim #${reviewingClaim.claim_id} marked ${claimNextStatus}.`);
      setReviewingClaim(null);
      loadAdminData();
    } catch (err) {
      setErrorMsg(
        err instanceof ApiError ? err.message : 'Could not update claim status.'
      );
    } finally {
      setReviewSaving(false);
    }
  }

  async function handleQuickApproveApplication(app: ApplicationRecord) {
    const key = `app-${app.application_id}`;
    setQuickApprovingKey(key);
    setErrorMsg('');
    try {
      const note =
        app.admin_notes?.trim() ||
        `Approved by ${user.full_name} via Owner & Admin Console.`;
      const res = await api.updateApplicationStatus(app.application_id, 'Approved', note);
      setApplications((prev) =>
        prev.map((a) => (a.application_id === app.application_id ? res.application : a))
      );
      setBannerMsg(`Application #${app.application_id} (${app.policy_name}) approved.`);
      loadAdminData();
    } catch (err) {
      setErrorMsg(
        err instanceof ApiError ? err.message : 'Could not approve application.'
      );
    } finally {
      setQuickApprovingKey(null);
    }
  }

  async function handleQuickApproveClaim(claim: ClaimRecord) {
    const key = `claim-${claim.claim_id}`;
    setQuickApprovingKey(key);
    setErrorMsg('');
    try {
      const note =
        claim.reviewer_notes?.trim() ||
        `Claim verified and approved for settlement by ${user.full_name}.`;
      const res = await api.updateClaimStatus(claim.claim_id, 'Approved', note);
      setClaims((prev) =>
        prev.map((c) => (c.claim_id === claim.claim_id ? res.claim : c))
      );
      setBannerMsg(`Claim #${claim.claim_id} (${formatCurrency(claim.claim_amount)}) approved.`);
      loadAdminData();
    } catch (err) {
      setErrorMsg(err instanceof ApiError ? err.message : 'Could not approve claim.');
    } finally {
      setQuickApprovingKey(null);
    }
  }

  function handleDownloadAdminAllClaimsBill() {
    const today = new Date().toISOString().slice(0, 10);
    const billSummary = computeClaimsBillSummary(claims);
    downloadDocument({
      filename: `PolicyPulse-All-Claims-Bill-${today}.html`,
      title: 'Consolidated Claims Billing & Settlement Statement',
      subtitle: `Issued by ${user.full_name} (${user.email})`,
      referenceId: `ADMIN-BILL-${today.replaceAll('-', '')}`,
      rows: [
        { label: 'Statement Date', value: today },
        { label: 'Total Submitted Claims', value: String(billSummary.totalClaimsCount) },
        {
          label: 'Total Claimed Amount',
          value: formatCurrency(billSummary.totalClaimedAmount),
        },
        {
          label: 'Approved & Settled Bill',
          value: formatCurrency(billSummary.approvedSettledAmount),
        },
        {
          label: 'Pending / Under Review',
          value: formatCurrency(billSummary.pendingReviewAmount),
        },
        {
          label: 'Declined / Rejected',
          value: formatCurrency(billSummary.rejectedAmount),
        },
      ],
      tableSection: {
        heading: 'Itemized Claims Billing Ledger',
        columns: [
          'Claim ID',
          'Member',
          'Policy Plan',
          'Hospital / Clinic',
          'Treatment Date',
          'Amount',
          'Status',
          'Reviewer Notes',
        ],
        rows: claims.map((c) => [
          `CLM-${c.claim_id}`,
          c.customer_name || 'Member',
          c.policy_name || `Application #${c.application_id}`,
          c.hospital_name,
          c.incident_date,
          formatCurrency(c.claim_amount),
          c.status,
          c.reviewer_notes || 'Pending evaluation',
        ]),
      },
      footerNote:
        'Generated by PolicyPulse Owner & Admin Billing Desk. Comprehensive claims statement.',
    });
  }

  function handleExportSummaryReport() {
    if (!overview || !analytics) return;
    downloadDocument({
      filename: `PolicyPulse-Admin-Operations-Report-${new Date()
        .toISOString()
        .slice(0, 10)}.html`,
      title: 'Administrative Operations & Analytics Report',
      subtitle: `Generated by ${user.full_name}`,
      referenceId: `RPT-${new Date().toISOString().slice(0, 10)}`,
      rows: [
        { label: 'Registered Customers', value: String(overview.stats.customerCount) },
        { label: 'Published Policies', value: String(overview.stats.policyCount) },
        {
          label: 'Approved Applications',
          value: String(overview.stats.approvedAppsCount),
        },
        { label: 'Pending Applications', value: String(overview.stats.pendingAppsCount) },
        { label: 'Open Claims Queue', value: String(overview.stats.openClaimsCount) },
        {
          label: 'Active Coverage Volume',
          value: formatCurrency(overview.stats.activeCoverageVolume),
        },
        {
          label: 'Total Premium Collected',
          value: formatCurrency(analytics.totalCollectedPremium),
        },
        {
          label: 'Approved Claim Payouts',
          value: formatCurrency(analytics.totalApprovedClaimPayout),
        },
      ],
    });
  }

  const navItems: Array<{ id: AdminTab; label: string; icon: typeof LayoutDashboard }> = [
    { id: 'overview', label: 'Overview & Customers', icon: LayoutDashboard },
    { id: 'analytics', label: 'Analytics & Trends', icon: BarChart3 },
    { id: 'policies', label: 'Manage Policies', icon: ShieldCheck },
    { id: 'applications', label: 'Applications Queue', icon: FileSpreadsheet },
    { id: 'claims', label: 'Claims Queue', icon: ClipboardCheck },
    { id: 'audit', label: 'Audit Logs', icon: History },
    { id: 'inquiries', label: 'Advisor Inquiries', icon: MessageSquare },
  ];

  const tabTitles: Record<AdminTab, string> = {
    overview: 'Operations Overview',
    analytics: 'Analytics & Coverage Trends',
    policies: 'Policy Catalogue Management',
    applications: 'Applications Review Queue',
    claims: 'Medical Claims Queue',
    audit: 'Security & Operations Audit Logs',
    inquiries: 'Coverage Inquiries',
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
              <span>PolicyPulse</span>
            </button>
            <button
              type="button"
              aria-label="Close admin menu"
              onClick={() => setMobileMenuOpen(false)}
              className="lg:hidden p-1.5 text-[#94A3B8] hover:text-white"
            >
              <X className="w-5 h-5" aria-hidden="true" />
            </button>
          </div>

          <div className="px-4 py-5">
            <p className="px-3 text-[10px] font-bold uppercase tracking-[0.18em] text-[#c5d5b6] mb-3">
              Owner &amp; Admin Console
            </p>
            <nav aria-label="Administrative navigation" className="space-y-1">
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
                    className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
                      active
                        ? 'bg-[#d7ed78] text-[#18342b] shadow-sm'
                        : 'text-[#d5dfd5] hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                    <span>{item.label}</span>
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
              aria-label="Open admin menu"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 -ml-1 text-[#475569] hover:text-[#0F172A]"
            >
              <Menu className="w-5 h-5" aria-hidden="true" />
            </button>
            <p className="text-sm text-[#64748B] truncate max-w-[165px] sm:max-w-none">
              <span className="hidden sm:inline">Owner &amp; Admin Console</span>
              <span className="hidden sm:inline mx-2" aria-hidden="true">
                /
              </span>
              <span className="font-semibold text-[#0E1A40]">{tabTitles[activeTab]}</span>
            </p>
          </div>

          <button
            type="button"
            onClick={openAddPolicyModal}
            className="inline-flex items-center gap-2 rounded-full bg-[#18342b] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#294d3f] whitespace-nowrap shrink-0 sm:text-sm"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            <span>Add Policy</span>
          </button>
        </header>

        <main className="flex-1 p-5 sm:p-6 lg:p-9 max-w-6xl w-full mx-auto space-y-7">
          {bannerMsg && (
            <div
              role="status"
              className="p-4 bg-[#ECFDF5] border border-[#A7F3D0] rounded-xl flex items-center justify-between gap-4 text-sm text-[#047857]"
            >
              <span>{bannerMsg}</span>
              <button
                type="button"
                aria-label="Dismiss notification"
                onClick={() => setBannerMsg('')}
                className="p-1 hover:bg-[#D1FAE5] rounded"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
          )}

          {errorMsg && (
            <div
              role="alert"
              className="p-4 bg-[#FFF1F2] border border-[#FECDD3] rounded-xl text-sm text-[#BE123C]"
            >
              {errorMsg}
            </div>
          )}

          {/* OVERVIEW TAB */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              <div>
                <h1 className="font-display text-2xl font-bold text-[#0E1A40]">
                  Administrative Overview
                </h1>
                <p className="mt-1 text-sm text-[#475569]">
                  Real-time summary of registered members, active policies, pending queues, and
                  underwritten coverage.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white border border-[#E2E8F0] rounded-xl p-5">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium text-[#64748B]">Registered Customers</p>
                    <span className="w-8 h-8 rounded-lg bg-[#EFF6FF] text-[#2563EB] flex items-center justify-center">
                      <Users className="w-4 h-4" aria-hidden="true" />
                    </span>
                  </div>
                  <p className="mt-2 font-mono text-2xl font-semibold text-[#0E1A40] tabular-nums">
                    {overview?.stats.customerCount ?? 0}
                  </p>
                  <p className="mt-1 text-xs text-[#475569]">
                    {overview?.stats.policyCount ?? policies.length} published plans
                  </p>
                </div>

                <div className="bg-white border border-[#E2E8F0] rounded-xl p-5">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium text-[#64748B]">Pending Applications</p>
                    <span className="w-8 h-8 rounded-lg bg-[#FFFBEB] text-[#D97706] flex items-center justify-center">
                      <Clock className="w-4 h-4" aria-hidden="true" />
                    </span>
                  </div>
                  <p className="mt-2 font-mono text-2xl font-semibold text-[#D97706] tabular-nums">
                    {overview?.stats.pendingAppsCount ?? 0}
                  </p>
                  <p className="mt-1 text-xs text-[#475569]">
                    {overview?.stats.approvedAppsCount ?? 0} approved active policies
                  </p>
                </div>

                <div className="bg-white border border-[#E2E8F0] rounded-xl p-5">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium text-[#64748B]">Open Claims Queue</p>
                    <span className="w-8 h-8 rounded-lg bg-[#EEF2FF] text-[#4F46E5] flex items-center justify-center">
                      <Activity className="w-4 h-4" aria-hidden="true" />
                    </span>
                  </div>
                  <p className="mt-2 font-mono text-2xl font-semibold text-[#4F46E5] tabular-nums">
                    {overview?.stats.openClaimsCount ?? 0}
                  </p>
                  <p className="mt-1 text-xs text-[#475569]">Pending or Under Review</p>
                </div>

                <div className="bg-white border border-[#E2E8F0] rounded-xl p-5">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium text-[#64748B]">Active Coverage Volume</p>
                    <span className="w-8 h-8 rounded-lg bg-[#ECFDF5] text-[#059669] flex items-center justify-center">
                      <ShieldCheck className="w-4 h-4" aria-hidden="true" />
                    </span>
                  </div>
                  <p className="mt-2 font-mono text-2xl font-semibold text-[#059669] tabular-nums">
                    {formatCurrency(overview?.stats.activeCoverageVolume ?? 0)}
                  </p>
                  <p className="mt-1 text-xs text-[#475569]">Across approved policies</p>
                </div>
              </div>

              <section className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
                <div className="px-5 py-4 border-b border-[#E2E8F0] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <h2 className="font-display text-base font-bold text-[#0E1A40]">
                    Customer Directory
                  </h2>
                  <div className="relative w-full sm:w-64">
                    <Search
                      className="w-4 h-4 text-[#64748B] absolute left-3 top-1/2 -translate-y-1/2"
                      aria-hidden="true"
                    />
                    <input
                      type="search"
                      aria-label="Search customers"
                      value={customerSearch}
                      onChange={(e) => setCustomerSearch(e.target.value)}
                      placeholder="Search by name or email..."
                      className="w-full pl-9 pr-3 py-2 bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-xs focus:bg-white focus:outline-none focus:border-[#2563EB]"
                    />
                  </div>
                </div>

                {loading ? (
                  <div className="p-6 text-sm text-[#64748B]">Loading customer records...</div>
                ) : filteredCustomers.length === 0 ? (
                  <div className="p-6 text-sm text-[#64748B]">
                    No customers match your search.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse min-w-[640px]">
                      <thead>
                        <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC] text-xs font-semibold text-[#475569]">
                          <th className="py-3 px-4">Customer</th>
                          <th className="py-3 px-4">Email</th>
                          <th className="py-3 px-4">Phone</th>
                          <th className="py-3 px-4 text-right">Applications</th>
                          <th className="py-3 px-4 text-right">Active Policies</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#F1F5F9] text-sm">
                        {filteredCustomers.map((c) => (
                          <tr key={c.user_id} className="hover:bg-[#F8FAFC]">
                            <td className="py-3 px-4 font-medium text-[#0F172A]">
                              {c.full_name}
                            </td>
                            <td className="py-3 px-4 text-[#475569]">{c.email}</td>
                            <td className="py-3 px-4 font-mono text-xs text-[#475569]">
                              {c.phone}
                            </td>
                            <td className="py-3 px-4 text-right font-mono tabular-nums">
                              {c.application_count}
                            </td>
                            <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-[#059669]">
                              {c.active_policies}
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

          {/* ANALYTICS & TRENDS TAB */}
          {activeTab === 'analytics' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h1 className="font-display text-2xl font-bold text-[#0E1A40]">
                    Analytics &amp; Coverage Trends
                  </h1>
                  <p className="mt-1 text-sm text-[#475569]">
                    Distribution of policy applications by category, claim settlements, and
                    premium billing volume.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleExportSummaryReport}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-[#CBD5E1] hover:border-[#2563EB] text-xs sm:text-sm font-semibold text-[#0E1A40] rounded-lg whitespace-nowrap"
                >
                  <Download className="w-4 h-4" aria-hidden="true" />
                  <span>Export Summary Report</span>
                </button>
              </div>

              {analytics && (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="bg-white border border-[#E2E8F0] rounded-xl p-5">
                      <p className="text-xs font-medium text-[#64748B]">
                        Collected Premiums
                      </p>
                      <p className="mt-2 font-mono text-2xl font-semibold text-[#059669] tabular-nums">
                        {formatCurrency(analytics.totalCollectedPremium)}
                      </p>
                      <p className="mt-1 text-xs text-[#475569] tabular-nums">
                        {analytics.totalPaymentsCount} recorded transactions
                      </p>
                    </div>
                    <div className="bg-white border border-[#E2E8F0] rounded-xl p-5">
                      <p className="text-xs font-medium text-[#64748B]">
                        Approved Claim Payouts
                      </p>
                      <p className="mt-2 font-mono text-2xl font-semibold text-[#2563EB] tabular-nums">
                        {formatCurrency(analytics.totalApprovedClaimPayout)}
                      </p>
                      <p className="mt-1 text-xs text-[#475569]">Settled claims</p>
                    </div>
                    <div className="bg-white border border-[#E2E8F0] rounded-xl p-5">
                      <p className="text-xs font-medium text-[#64748B]">
                        Total Claim Volume
                      </p>
                      <p className="mt-2 font-mono text-2xl font-semibold text-[#4F46E5] tabular-nums">
                        {formatCurrency(analytics.totalClaimRequested)}
                      </p>
                      <p className="mt-1 text-xs text-[#475569]">Across all statuses</p>
                    </div>
                    <div className="bg-white border border-[#E2E8F0] rounded-xl p-5">
                      <p className="text-xs font-medium text-[#64748B]">
                        Approved Policy Rate
                      </p>
                      <p className="mt-2 font-mono text-2xl font-semibold text-[#0E1A40] tabular-nums">
                        {applications.length > 0
                          ? `${Math.round(
                              (analytics.appStatusCounts.Approved / applications.length) * 100
                            )}%`
                          : '0%'}
                      </p>
                      <p className="mt-1 text-xs text-[#475569] tabular-nums">
                        {analytics.appStatusCounts.Approved} of {applications.length}{' '}
                        {applications.length === 1 ? 'app' : 'apps'}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <section className="bg-white border border-[#E2E8F0] rounded-xl p-6">
                      <h2 className="font-display text-base font-bold text-[#0E1A40]">
                        Applications by Policy Category
                      </h2>
                      <div className="mt-4 space-y-4">
                        {analytics.byCategory.map((cat) => {
                          const maxApps = Math.max(
                            1,
                            ...analytics.byCategory.map((c) => c.applicationCount)
                          );
                          const pct = Math.round((cat.applicationCount / maxApps) * 100);
                          return (
                            <div key={cat.category} className="space-y-1.5">
                              <div className="flex items-center justify-between text-sm">
                                <span className="font-medium text-[#0F172A]">
                                  {cat.category}
                                </span>
                                <span className="font-mono text-xs text-[#475569] tabular-nums">
                                  {cat.applicationCount}{' '}
                                  {cat.applicationCount === 1 ? 'app' : 'apps'} (
                                  {cat.approvedCount} approved)
                                </span>
                              </div>
                              <div className="h-2.5 bg-[#E2E8F0] rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full ${getCategoryBarColor(
                                    cat.category
                                  )}`}
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </section>

                    <section className="bg-white border border-[#E2E8F0] rounded-xl p-6 space-y-6">
                      <div>
                        <h2 className="font-display text-base font-bold text-[#0E1A40]">
                          Application Status Distribution
                        </h2>
                        <div className="mt-4 space-y-3">
                          {(['Approved', 'Pending', 'Rejected'] as const).map((st) => {
                            const count = analytics.appStatusCounts[st];
                            const total = Math.max(1, applications.length);
                            const pct = Math.round((count / total) * 100);
                            return (
                              <div key={st} className="flex items-center justify-between gap-4">
                                <StatusIndicator status={st} />
                                <div className="flex-1 h-2.5 bg-[#E2E8F0] rounded-full overflow-hidden">
                                  <div
                                    className={`h-full rounded-full ${getStatusBarColor(st)}`}
                                    style={{ width: `${pct}%` }}
                                  />
                                </div>
                                <span className="font-mono text-xs text-[#475569] tabular-nums w-16 text-right">
                                  {count} ({pct}%)
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      <div className="pt-4 border-t border-[#F1F5F9]">
                        <h2 className="font-display text-base font-bold text-[#0E1A40]">
                          Claim Status Distribution
                        </h2>
                        <div className="mt-4 space-y-3">
                          {(
                            ['Approved', 'Under Review', 'Pending', 'Rejected'] as const
                          ).map((st) => {
                            const count = analytics.claimStatusCounts[st];
                            const total = Math.max(1, claims.length);
                            const pct = Math.round((count / total) * 100);
                            return (
                              <div key={st} className="flex items-center justify-between gap-4">
                                <StatusIndicator status={st} />
                                <div className="flex-1 h-2.5 bg-[#E2E8F0] rounded-full overflow-hidden">
                                  <div
                                    className={`h-full rounded-full ${getStatusBarColor(st)}`}
                                    style={{ width: `${pct}%` }}
                                  />
                                </div>
                                <span className="font-mono text-xs text-[#475569] tabular-nums w-16 text-right">
                                  {count} ({pct}%)
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </section>
                  </div>
                </>
              )}
            </div>
          )}

          {/* MANAGE POLICIES TAB */}
          {activeTab === 'policies' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h1 className="font-display text-2xl font-bold text-[#0E1A40]">
                    Manage Insurance Policies
                  </h1>
                  <p className="mt-1 text-sm text-[#475569]">
                    Add, update, or remove plans displayed in the public and member policy
                    catalogues.
                  </p>
                </div>
                <div className="relative w-full sm:w-64">
                  <Search
                    className="w-4 h-4 text-[#64748B] absolute left-3 top-1/2 -translate-y-1/2"
                    aria-hidden="true"
                  />
                  <input
                    type="search"
                    aria-label="Search policies"
                    value={policySearch}
                    onChange={(e) => setPolicySearch(e.target.value)}
                    placeholder="Filter policies..."
                    className="w-full pl-9 pr-3 py-2 bg-white border border-[#CBD5E1] rounded-lg text-sm focus:outline-none focus:border-[#2563EB]"
                  />
                </div>
              </div>

              <div className="bg-white border border-[#E2E8F0] rounded-xl overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[780px]">
                  <thead>
                    <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC] text-xs font-semibold text-[#475569]">
                      <th className="py-3 px-4">ID</th>
                      <th className="py-3 px-4">Policy Name</th>
                      <th className="py-3 px-4">Category</th>
                      <th className="py-3 px-4 text-right">Monthly Premium</th>
                      <th className="py-3 px-4 text-right">Coverage Limit</th>
                      <th className="py-3 px-4 text-right">Term</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F1F5F9] text-sm">
                    {filteredPolicies.map((policy) => (
                      <tr key={policy.policy_id} className="hover:bg-[#F8FAFC]">
                        <td className="py-3 px-4 font-mono text-xs text-[#64748B] tabular-nums">
                          #{policy.policy_id}
                        </td>
                        <td className="py-3 px-4 font-semibold text-[#0F172A]">
                          {policy.policy_name}
                        </td>
                        <td className="py-3 px-4 text-[#475569]">{policy.category}</td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums">
                          {formatCurrency(policy.premium_amount)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-[#059669]">
                          {formatCurrency(policy.coverage_amount)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-xs text-[#475569] tabular-nums">
                          {policy.term_months} mo
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="inline-flex items-center gap-2">
                            <button
                              type="button"
                              aria-label={`Edit ${policy.policy_name}`}
                              onClick={() => openEditPolicyModal(policy)}
                              className="p-1.5 text-[#475569] hover:text-[#2563EB] hover:bg-[#EFF6FF] rounded"
                            >
                              <Pencil className="w-4 h-4" aria-hidden="true" />
                            </button>
                            <button
                              type="button"
                              aria-label={`Delete ${policy.policy_name}`}
                              onClick={() => {
                                setDeletingPolicy(policy);
                                setDeleteError('');
                              }}
                              className="p-1.5 text-[#E11D48] hover:bg-[#FFF1F2] rounded"
                            >
                              <Trash2 className="w-4 h-4" aria-hidden="true" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* APPLICATIONS QUEUE TAB */}
          {activeTab === 'applications' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h1 className="font-display text-2xl font-bold text-[#0E1A40]">
                    Customer Applications Queue
                  </h1>
                  <p className="mt-1 text-sm text-[#475569]">
                    Review applicant age, nominee details, and medical notes before approving
                    policy coverage.
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
                  <div className="p-8 text-center text-sm text-[#64748B]">
                    No applications in this queue.
                  </div>
                ) : (
                  <table className="w-full text-left border-collapse min-w-[820px]">
                    <thead>
                      <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC] text-xs font-semibold text-[#475569]">
                        <th className="py-3 px-4">ID</th>
                        <th className="py-3 px-4">Applicant</th>
                        <th className="py-3 px-4">Policy</th>
                        <th className="py-3 px-4">Age / Nominee</th>
                        <th className="py-3 px-4">Date</th>
                        <th className="py-3 px-4">Status</th>
                        <th className="py-3 px-4 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#F1F5F9] text-sm">
                      {filteredApplications.map((app) => (
                        <tr key={app.application_id} className="hover:bg-[#F8FAFC]">
                          <td className="py-3 px-4 font-mono text-xs text-[#64748B] tabular-nums">
                            #{app.application_id}
                          </td>
                          <td className="py-3 px-4">
                            <p className="font-medium text-[#0F172A]">{app.customer_name}</p>
                            <p className="text-xs text-[#64748B]">{app.customer_email}</p>
                          </td>
                          <td className="py-3 px-4 font-medium text-[#0E1A40]">
                            {app.policy_name}
                          </td>
                          <td className="py-3 px-4 text-xs text-[#475569]">
                            Age {app.applicant_age} · {app.nominee_name}
                          </td>
                          <td className="py-3 px-4 font-mono text-xs text-[#475569] tabular-nums">
                            {app.application_date}
                          </td>
                          <td className="py-3 px-4">
                            <StatusIndicator status={app.status} />
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="inline-flex items-center gap-2">
                              {app.status === 'Pending' && (
                                <button
                                  type="button"
                                  disabled={quickApprovingKey === `app-${app.application_id}`}
                                  onClick={() => handleQuickApproveApplication(app)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-white bg-[#059669] hover:bg-[#047857] disabled:opacity-60 rounded-md transition-colors whitespace-nowrap"
                                >
                                  <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                                  <span>
                                    {quickApprovingKey === `app-${app.application_id}`
                                      ? 'Approving...'
                                      : 'Approve'}
                                  </span>
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => {
                                  setReviewingApp(app);
                                  setAppNextStatus(
                                    app.status === 'Pending' ? 'Approved' : app.status
                                  );
                                  setAppAdminNotes(app.admin_notes || '');
                                }}
                                className="px-3 py-1.5 text-xs font-semibold text-[#0E1A40] bg-[#EFF6FF] hover:bg-[#2563EB] hover:text-white rounded-md transition-colors whitespace-nowrap"
                              >
                                Review #{app.application_id}
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}

          {/* CLAIMS QUEUE TAB */}
          {activeTab === 'claims' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h1 className="font-display text-2xl font-bold text-[#0E1A40]">
                    Medical Claims Queue
                  </h1>
                  <p className="mt-1 text-sm text-[#475569]">
                    Inspect submitted treatment invoices, approve pending claims, and download
                    consolidated claims bills.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    disabled={claims.length === 0}
                    onClick={handleDownloadAdminAllClaimsBill}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-[#0E1A40] hover:bg-[#2563EB] disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-colors whitespace-nowrap"
                  >
                    <Download className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Download All Claims Bill</span>
                  </button>
                  <div className="flex flex-wrap gap-1 p-1 bg-[#E2E8F0] rounded-lg w-fit">
                    {['All', 'Pending', 'Under Review', 'Approved', 'Rejected'].map((st) => (
                      <button
                        key={st}
                        type="button"
                        onClick={() => setClaimStatusFilter(st)}
                        className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
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
              </div>

              <div className="bg-white border border-[#E2E8F0] rounded-xl overflow-x-auto">
                {filteredClaims.length === 0 ? (
                  <div className="p-8 text-center text-sm text-[#64748B]">
                    No claims match this status filter.
                  </div>
                ) : (
                  <table className="w-full text-left border-collapse min-w-[820px]">
                    <thead>
                      <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC] text-xs font-semibold text-[#475569]">
                        <th className="py-3 px-3">ID</th>
                        <th className="py-3 px-3">Member</th>
                        <th className="py-3 px-3">Policy &amp; Hospital</th>
                        <th className="py-3 px-3 text-right">Amount</th>
                        <th className="py-3 px-3">Progress</th>
                        <th className="py-3 px-3">Status</th>
                        <th className="py-3 px-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#F1F5F9] text-sm">
                      {filteredClaims.map((claim) => {
                        const progress = getClaimProgress(claim.status);
                        return (
                          <tr key={claim.claim_id} className="hover:bg-[#F8FAFC]">
                            <td className="py-3 px-3 font-mono text-xs text-[#64748B] tabular-nums">
                              #{claim.claim_id}
                            </td>
                            <td className="py-3 px-3">
                              <p className="font-medium text-[#0F172A]">
                                {claim.customer_name}
                              </p>
                              <p className="text-xs text-[#64748B]">{claim.customer_email}</p>
                            </td>
                            <td className="py-3 px-3">
                              <p className="font-medium text-[#0E1A40]">{claim.policy_name}</p>
                              <p className="text-xs text-[#64748B]">
                                {claim.hospital_name} ·{' '}
                                <span className="font-mono tabular-nums whitespace-nowrap">
                                  {claim.incident_date}
                                </span>
                              </p>
                            </td>
                            <td className="py-3 px-3 text-right font-mono tabular-nums font-semibold text-[#0E1A40] whitespace-nowrap">
                              {formatCurrency(claim.claim_amount)}
                            </td>
                            <td className="py-3 px-3">
                              <div className="flex items-center gap-2 min-w-[100px]">
                                <div className="flex-1 h-2 bg-[#E2E8F0] rounded-full overflow-hidden">
                                  <div
                                    className={`h-full rounded-full ${progress.barClass}`}
                                    style={{ width: `${progress.percent}%` }}
                                  />
                                </div>
                                <span className="font-mono text-xs text-[#475569] tabular-nums w-8 text-right">
                                  {progress.percent}%
                                </span>
                              </div>
                            </td>
                            <td className="py-3 px-3 whitespace-nowrap">
                              <StatusIndicator status={claim.status} />
                            </td>
                            <td className="py-3 px-3 text-right">
                              <div className="inline-flex items-center gap-1.5">
                                {(claim.status === 'Pending' ||
                                  claim.status === 'Under Review') && (
                                  <button
                                    type="button"
                                    disabled={quickApprovingKey === `claim-${claim.claim_id}`}
                                    onClick={() => handleQuickApproveClaim(claim)}
                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-white bg-[#059669] hover:bg-[#047857] disabled:opacity-60 rounded-md transition-colors whitespace-nowrap"
                                  >
                                    <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                                    <span>
                                      {quickApprovingKey === `claim-${claim.claim_id}`
                                        ? 'Approving...'
                                        : 'Approve'}
                                    </span>
                                  </button>
                                )}
                                <button
                                  type="button"
                                  aria-label={`Inspect claim #${claim.claim_id}`}
                                  onClick={() => setInspectingClaim(claim)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-[#2563EB] bg-[#EFF6FF] hover:bg-[#2563EB] hover:text-white rounded-md transition-colors whitespace-nowrap"
                                >
                                  <Eye className="w-3.5 h-3.5" aria-hidden="true" />
                                  <span>Inspect</span>
                                </button>
                                <button
                                  type="button"
                                  aria-label={`Update claim #${claim.claim_id}`}
                                  onClick={() => openClaimVerdictModal(claim)}
                                  className="px-2.5 py-1.5 text-xs font-semibold text-[#0E1A40] bg-[#F1F5F9] hover:bg-[#0E1A40] hover:text-white rounded-md transition-colors whitespace-nowrap"
                                >
                                  Update
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
          )}

          {/* AUDIT LOGS TAB */}
          {activeTab === 'audit' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h1 className="font-display text-2xl font-bold text-[#0E1A40]">
                    Security &amp; Operations Audit Logs
                  </h1>
                  <p className="mt-1 text-sm text-[#475569]">
                    Chronological ledger of logins, policy changes, application reviews, claim
                    updates, case notes, and payments.
                  </p>
                </div>
                <div className="relative w-full sm:w-64">
                  <Search
                    className="w-4 h-4 text-[#64748B] absolute left-3 top-1/2 -translate-y-1/2"
                    aria-hidden="true"
                  />
                  <input
                    type="search"
                    aria-label="Search audit logs"
                    value={auditSearch}
                    onChange={(e) => setAuditSearch(e.target.value)}
                    placeholder="Filter by actor or action..."
                    className="w-full pl-9 pr-3 py-2 bg-white border border-[#CBD5E1] rounded-lg text-sm focus:outline-none focus:border-[#2563EB]"
                  />
                </div>
              </div>

              <div className="bg-white border border-[#E2E8F0] rounded-xl overflow-x-auto">
                {filteredAuditLogs.length === 0 ? (
                  <div className="p-8 text-center text-sm text-[#64748B]">
                    No audit records match your search.
                  </div>
                ) : (
                  <table className="w-full text-left border-collapse min-w-[780px]">
                    <thead>
                      <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC] text-xs font-semibold text-[#475569]">
                        <th className="py-3 px-4">Timestamp</th>
                        <th className="py-3 px-4">Actor</th>
                        <th className="py-3 px-4">Action</th>
                        <th className="py-3 px-4">Target</th>
                        <th className="py-3 px-4">Details</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#F1F5F9] text-sm">
                      {filteredAuditLogs.map((log) => (
                        <tr key={log.log_id} className="hover:bg-[#F8FAFC]">
                          <td className="py-3 px-4 font-mono text-xs text-[#64748B] tabular-nums whitespace-nowrap">
                            {log.created_at}
                          </td>
                          <td className="py-3 px-4">
                            <span className="font-medium text-[#0F172A]">{log.actor_name}</span>
                            <span className="ml-2 text-xs text-[#64748B]">{log.actor_role}</span>
                          </td>
                          <td className="py-3 px-4 font-mono text-xs text-[#2563EB] font-medium">
                            {log.action}
                          </td>
                          <td className="py-3 px-4 font-mono text-xs text-[#475569]">
                            {log.target_type} {log.target_id}
                          </td>
                          <td className="py-3 px-4 text-xs text-[#475569]">{log.details}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}

          {/* ADVISOR INQUIRIES TAB */}
          {activeTab === 'inquiries' && (
            <div className="space-y-6">
              <div>
                <h1 className="font-display text-2xl font-bold text-[#0E1A40]">
                  Coverage Advisor Inquiries
                </h1>
                <p className="mt-1 text-sm text-[#475569]">
                  Callback requests submitted via the public landing page quote form.
                </p>
              </div>

              <div className="bg-white border border-[#E2E8F0] rounded-xl overflow-x-auto">
                {!overview?.inquiries?.length ? (
                  <div className="p-8 text-center text-sm text-[#64748B]">
                    No quote inquiries have been submitted yet.
                  </div>
                ) : (
                  <table className="w-full text-left border-collapse min-w-[680px]">
                    <thead>
                      <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC] text-xs font-semibold text-[#475569]">
                        <th className="py-3 px-4">Name</th>
                        <th className="py-3 px-4">Contact</th>
                        <th className="py-3 px-4">Category</th>
                        <th className="py-3 px-4">Notes</th>
                        <th className="py-3 px-4">Received</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#F1F5F9] text-sm">
                      {overview.inquiries.map((inq) => (
                        <tr key={inq.inquiry_id} className="hover:bg-[#F8FAFC]">
                          <td className="py-3 px-4 font-medium text-[#0F172A]">
                            {inq.full_name}
                          </td>
                          <td className="py-3 px-4 text-xs text-[#475569]">
                            <div>{inq.email}</div>
                            <div className="font-mono">{inq.phone}</div>
                          </td>
                          <td className="py-3 px-4 text-[#0E1A40]">{inq.preferred_category}</td>
                          <td className="py-3 px-4 text-xs text-[#475569] max-w-sm">
                            {inq.message || '—'}
                          </td>
                          <td className="py-3 px-4 font-mono text-xs text-[#64748B] tabular-nums">
                            {String(inq.created_at ?? '').slice(0, 10) || '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Mobile Bottom Navigation Bar (< lg) */}
      <nav
        aria-label="Admin mobile navigation"
        className="lg:hidden fixed bottom-0 inset-x-0 z-30 h-14 bg-white border-t border-[#E2E8F0] grid grid-cols-5"
      >
        {(
          [
            { id: 'overview', label: 'Overview', icon: LayoutDashboard },
            { id: 'analytics', label: 'Analytics', icon: BarChart3 },
            { id: 'policies', label: 'Policies', icon: ShieldCheck },
            { id: 'applications', label: 'Apps', icon: FileSpreadsheet },
            { id: 'claims', label: 'Claims', icon: ClipboardCheck },
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

      {/* ADD / EDIT POLICY MODAL */}
      {policyModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-[#0E1A40]/55 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="policy-modal-title"
        >
          <div className="bg-white border border-[#E2E8F0] rounded-2xl max-w-lg w-full p-6 sm:p-8 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between gap-4">
              <h2
                id="policy-modal-title"
                className="font-display text-xl font-bold text-[#0E1A40]"
              >
                {editingPolicy ? 'Edit Health Policy' : 'Add New Health Policy'}
              </h2>
              <button
                type="button"
                aria-label="Close policy dialog"
                onClick={() => setPolicyModalOpen(false)}
                className="p-1.5 text-[#64748B] hover:text-[#0F172A] rounded-lg"
              >
                <X className="w-5 h-5" aria-hidden="true" />
              </button>
            </div>

            {policyFormError && (
              <div
                role="alert"
                className="mt-4 p-3 bg-[#FFF1F2] border border-[#FECDD3] rounded-lg text-sm text-[#BE123C]"
              >
                {policyFormError}
              </div>
            )}

            <form onSubmit={handleSavePolicy} noValidate className="mt-5 space-y-4">
              <div>
                <label
                  htmlFor="pol-name"
                  className="block text-sm font-medium text-[#1E293B] mb-1"
                >
                  Policy Name
                </label>
                <input
                  id="pol-name"
                  type="text"
                  value={pName}
                  onChange={(e) => setPName(e.target.value)}
                  placeholder="Executive Wellness Shield"
                  className="w-full px-3.5 py-2.5 bg-white border border-[#CBD5E1] rounded-lg text-sm focus:outline-none focus:border-[#2563EB]"
                />
                {policyFieldErrors.policy_name && (
                  <p className="mt-1 text-xs text-[#BE123C]">
                    {policyFieldErrors.policy_name}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="pol-category"
                    className="block text-sm font-medium text-[#1E293B] mb-1"
                  >
                    Category
                  </label>
                  <select
                    id="pol-category"
                    value={pCategory}
                    onChange={(e) => setPCategory(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-white border border-[#CBD5E1] rounded-lg text-sm focus:outline-none focus:border-[#2563EB]"
                  >
                    {POLICY_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="pol-term"
                    className="block text-sm font-medium text-[#1E293B] mb-1"
                  >
                    Term (Months)
                  </label>
                  <input
                    id="pol-term"
                    type="number"
                    min="1"
                    max="360"
                    value={pTerm}
                    onChange={(e) => setPTerm(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-white border border-[#CBD5E1] rounded-lg text-sm font-mono tabular-nums focus:outline-none focus:border-[#2563EB]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="pol-premium"
                    className="block text-sm font-medium text-[#1E293B] mb-1"
                  >
                    Monthly Premium (USD)
                  </label>
                  <input
                    id="pol-premium"
                    type="number"
                    min="1"
                    step="0.01"
                    value={pPremium}
                    onChange={(e) => setPPremium(e.target.value)}
                    placeholder="125"
                    className="w-full px-3.5 py-2.5 bg-white border border-[#CBD5E1] rounded-lg text-sm font-mono tabular-nums focus:outline-none focus:border-[#2563EB]"
                  />
                  {policyFieldErrors.premium_amount && (
                    <p className="mt-1 text-xs text-[#BE123C]">
                      {policyFieldErrors.premium_amount}
                    </p>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="pol-coverage"
                    className="block text-sm font-medium text-[#1E293B] mb-1"
                  >
                    Coverage Limit (USD)
                  </label>
                  <input
                    id="pol-coverage"
                    type="number"
                    min="1"
                    step="1"
                    value={pCoverage}
                    onChange={(e) => setPCoverage(e.target.value)}
                    placeholder="200000"
                    className="w-full px-3.5 py-2.5 bg-white border border-[#CBD5E1] rounded-lg text-sm font-mono tabular-nums focus:outline-none focus:border-[#2563EB]"
                  />
                  {policyFieldErrors.coverage_amount && (
                    <p className="mt-1 text-xs text-[#BE123C]">
                      {policyFieldErrors.coverage_amount}
                    </p>
                  )}
                </div>
              </div>

              <div>
                <label
                  htmlFor="pol-desc"
                  className="block text-sm font-medium text-[#1E293B] mb-1"
                >
                  Description
                </label>
                <textarea
                  id="pol-desc"
                  rows={3}
                  value={pDescription}
                  onChange={(e) => setPDescription(e.target.value)}
                  placeholder="Describe inpatient, outpatient, and preventive coverage benefits..."
                  className="w-full px-3.5 py-2.5 bg-white border border-[#CBD5E1] rounded-lg text-sm focus:outline-none focus:border-[#2563EB]"
                />
                {policyFieldErrors.description && (
                  <p className="mt-1 text-xs text-[#BE123C]">
                    {policyFieldErrors.description}
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="pol-highlights"
                  className="block text-sm font-medium text-[#1E293B] mb-1"
                >
                  Key Highlights (Optional)
                </label>
                <input
                  id="pol-highlights"
                  type="text"
                  value={pHighlights}
                  onChange={(e) => setPHighlights(e.target.value)}
                  placeholder="Zero co-pay · Annual lab screening · Telehealth included"
                  className="w-full px-3.5 py-2.5 bg-white border border-[#CBD5E1] rounded-lg text-sm focus:outline-none focus:border-[#2563EB]"
                />
              </div>

              <div className="pt-2 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setPolicyModalOpen(false)}
                  className="px-4 py-2.5 text-sm font-medium text-[#475569] hover:text-[#0F172A]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={policySaving}
                  className="px-5 py-2.5 bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-60 text-white text-sm font-semibold rounded-lg transition-colors whitespace-nowrap"
                >
                  {policySaving
                    ? 'Saving...'
                    : editingPolicy
                    ? 'Save Policy Changes'
                    : 'Create Policy'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE POLICY CONFIRM MODAL */}
      {deletingPolicy && (
        <div
          className="fixed inset-0 z-50 bg-[#0E1A40]/55 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-policy-title"
        >
          <div className="bg-white border border-[#E2E8F0] rounded-2xl max-w-md w-full p-6 shadow-xl">
            <h2
              id="delete-policy-title"
              className="font-display text-lg font-bold text-[#0E1A40]"
            >
              Delete &ldquo;{deletingPolicy.policy_name}&rdquo;?
            </h2>
            <p className="mt-2 text-sm text-[#475569]">
              This removes the policy from the catalogue. Policies with existing customer
              applications cannot be deleted to preserve audit integrity.
            </p>
            {deleteError && (
              <div
                role="alert"
                className="mt-4 p-3 bg-[#FFF1F2] border border-[#FECDD3] rounded-lg text-sm text-[#BE123C]"
              >
                {deleteError}
              </div>
            )}
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeletingPolicy(null)}
                className="px-4 py-2 text-sm font-medium text-[#475569] hover:text-[#0F172A]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDeletePolicy}
                className="px-4 py-2 bg-[#E11D48] hover:bg-[#BE123C] text-white text-sm font-semibold rounded-lg"
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* REVIEW APPLICATION MODAL */}
      {reviewingApp && (
        <div
          className="fixed inset-0 z-50 bg-[#0E1A40]/55 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="review-app-title"
        >
          <div className="bg-white border border-[#E2E8F0] rounded-2xl max-w-lg w-full p-6 sm:p-8 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold text-[#2563EB]">
                  Application #{reviewingApp.application_id}
                </p>
                <h2
                  id="review-app-title"
                  className="mt-1 font-display text-xl font-bold text-[#0E1A40]"
                >
                  {reviewingApp.customer_name} — {reviewingApp.policy_name}
                </h2>
              </div>
              <button
                type="button"
                aria-label="Close application review"
                onClick={() => setReviewingApp(null)}
                className="p-1.5 text-[#64748B] hover:text-[#0F172A]"
              >
                <X className="w-5 h-5" aria-hidden="true" />
              </button>
            </div>

            <div className="mt-4 p-4 bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg space-y-1.5 text-sm">
              <p>
                <span className="text-[#64748B]">Applicant Age:</span>{' '}
                <strong className="font-mono">{reviewingApp.applicant_age}</strong> ·{' '}
                <span className="text-[#64748B]">Nominee:</span>{' '}
                <strong>{reviewingApp.nominee_name}</strong>
              </p>
              <p className="text-xs text-[#475569]">
                Medical Notes: {reviewingApp.medical_notes || 'None provided'}
              </p>
            </div>

            <form onSubmit={handleSaveApplicationReview} className="mt-5 space-y-4">
              <div>
                <label
                  htmlFor="rev-app-status"
                  className="block text-sm font-medium text-[#1E293B] mb-1.5"
                >
                  Decision Status
                </label>
                <select
                  id="rev-app-status"
                  value={appNextStatus}
                  onChange={(e) => setAppNextStatus(e.target.value as ApplicationStatus)}
                  className="w-full px-3.5 py-2.5 bg-white border border-[#CBD5E1] rounded-lg text-sm focus:outline-none focus:border-[#2563EB]"
                >
                  <option value="Pending">Pending</option>
                  <option value="Approved">Approved</option>
                  <option value="Rejected">Rejected</option>
                </select>
              </div>

              <div>
                <label
                  htmlFor="rev-app-notes"
                  className="block text-sm font-medium text-[#1E293B] mb-1.5"
                >
                  Underwriter Notes
                </label>
                <textarea
                  id="rev-app-notes"
                  rows={3}
                  value={appAdminNotes}
                  onChange={(e) => setAppAdminNotes(e.target.value)}
                  placeholder="Document eligibility verification or rejection rationale..."
                  className="w-full px-3.5 py-2.5 bg-white border border-[#CBD5E1] rounded-lg text-sm focus:outline-none focus:border-[#2563EB]"
                />
              </div>

              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setReviewingApp(null)}
                  className="px-4 py-2 text-sm font-medium text-[#475569] hover:text-[#0F172A]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={reviewSaving}
                  className="px-5 py-2.5 bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-sm font-semibold rounded-lg"
                >
                  {reviewSaving ? 'Saving...' : 'Save Decision'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* REVIEW CLAIM MODAL */}
      {reviewingClaim && (
        <div
          className="fixed inset-0 z-50 bg-[#0E1A40]/55 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="review-claim-title"
        >
          <div className="bg-white border border-[#E2E8F0] rounded-2xl max-w-lg w-full p-6 sm:p-8 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold text-[#2563EB]">
                  Claim #{reviewingClaim.claim_id} · {reviewingClaim.policy_name}
                </p>
                <h2
                  id="review-claim-title"
                  className="mt-1 font-display text-xl font-bold text-[#0E1A40]"
                >
                  {reviewingClaim.customer_name} —{' '}
                  <span className="font-mono tabular-nums">
                    {formatCurrency(reviewingClaim.claim_amount)}
                  </span>
                </h2>
              </div>
              <button
                type="button"
                aria-label="Close claim review"
                onClick={() => setReviewingClaim(null)}
                className="p-1.5 text-[#64748B] hover:text-[#0F172A]"
              >
                <X className="w-5 h-5" aria-hidden="true" />
              </button>
            </div>

            <div className="mt-4 p-4 bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg space-y-1.5 text-sm">
              <p>
                <span className="text-[#64748B]">Hospital:</span>{' '}
                <strong>{reviewingClaim.hospital_name}</strong> ·{' '}
                <span className="text-[#64748B]">Treatment Date:</span>{' '}
                <span className="font-mono">{reviewingClaim.incident_date}</span>
              </p>
              <p className="text-xs text-[#475569]">{reviewingClaim.claim_details}</p>
            </div>

            <form onSubmit={handleSaveClaimReview} className="mt-5 space-y-4">
              <div>
                <label
                  htmlFor="rev-claim-status"
                  className="block text-sm font-medium text-[#1E293B] mb-1.5"
                >
                  Claim Status
                </label>
                <select
                  id="rev-claim-status"
                  value={claimNextStatus}
                  onChange={(e) => setClaimNextStatus(e.target.value as ClaimStatus)}
                  className="w-full px-3.5 py-2.5 bg-white border border-[#CBD5E1] rounded-lg text-sm focus:outline-none focus:border-[#2563EB]"
                >
                  <option value="Pending">Pending</option>
                  <option value="Under Review">Under Review</option>
                  <option value="Approved">Approved</option>
                  <option value="Rejected">Rejected</option>
                </select>
              </div>

              <div>
                <label
                  htmlFor="rev-claim-notes"
                  className="block text-sm font-medium text-[#1E293B] mb-1.5"
                >
                  Reviewer Notes
                </label>
                <textarea
                  id="rev-claim-notes"
                  rows={3}
                  value={claimReviewerNotes}
                  onChange={(e) => setClaimReviewerNotes(e.target.value)}
                  placeholder="Record invoice verification or settlement remarks..."
                  className="w-full px-3.5 py-2.5 bg-white border border-[#CBD5E1] rounded-lg text-sm focus:outline-none focus:border-[#2563EB]"
                />
              </div>

              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setReviewingClaim(null)}
                  className="px-4 py-2 text-sm font-medium text-[#475569] hover:text-[#0F172A]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={reviewSaving}
                  className="px-5 py-2.5 bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-sm font-semibold rounded-lg"
                >
                  {reviewSaving ? 'Updating...' : 'Update Claim'}
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
          role="admin"
          onClose={() => setInspectingClaim(null)}
          onAdminUpdateStatus={(claim) => {
            setInspectingClaim(null);
            openClaimVerdictModal(claim);
          }}
        />
      )}
    </div>
  );
}
