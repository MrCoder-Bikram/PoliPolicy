import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  Activity,
  ArrowRight,
  Building2,
  Check,
  Clock,
  HeartPulse,
  Scale,
  Search,
  Shield,
  ShieldCheck,
  Users,
  X,
} from 'lucide-react';
import type { UserProfile } from '../services/api';
import { api, ApiError } from '../services/api';
import {
  calculateEstimatedPremium,
  formatCurrency,
  validateInquiryInput,
  type PartnerHospitalRecord,
  type PolicyRecord,
} from '../utils/insuranceRules';

interface LandingPageProps {
  policies: PolicyRecord[];
  loadingPolicies: boolean;
  policiesError?: string;
  onRetryPolicies?: () => void;
  currentUser: UserProfile | null;
  onOpenPortal: () => void;
  onOpenAuth: (mode: 'login' | 'register', policyId?: number) => void;
  onApplyPolicy: (policyId: number) => void;
}

const CATEGORIES = [
  'All',
  'Individual Health',
  'Family Floater',
  'Senior Care',
  'Critical Illness',
  'Maternity & Newborn',
  'Preventive Care',
];

function getCategoryAccent(category: string): {
  bar: string;
  text: string;
  iconBg: string;
} {
  switch (category) {
    case 'Family Floater':
      return {
        bar: 'bg-[#059669]',
        text: 'text-[#059669]',
        iconBg: 'bg-[#ECFDF5] text-[#059669]',
      };
    case 'Senior Care':
      return {
        bar: 'bg-[#4F46E5]',
        text: 'text-[#4F46E5]',
        iconBg: 'bg-[#EEF2FF] text-[#4F46E5]',
      };
    case 'Critical Illness':
      return {
        bar: 'bg-[#E11D48]',
        text: 'text-[#E11D48]',
        iconBg: 'bg-[#FFF1F2] text-[#E11D48]',
      };
    case 'Maternity & Newborn':
      return {
        bar: 'bg-[#D97706]',
        text: 'text-[#D97706]',
        iconBg: 'bg-[#FFFBEB] text-[#D97706]',
      };
    case 'Preventive Care':
      return {
        bar: 'bg-[#0D9488]',
        text: 'text-[#0D9488]',
        iconBg: 'bg-[#F0FDFA] text-[#0D9488]',
      };
    default:
      return {
        bar: 'bg-[#2563EB]',
        text: 'text-[#2563EB]',
        iconBg: 'bg-[#EFF6FF] text-[#2563EB]',
      };
  }
}

export function LandingPage({
  policies,
  loadingPolicies,
  policiesError = '',
  onRetryPolicies,
  currentUser,
  onOpenPortal,
  onOpenAuth,
  onApplyPolicy,
}: LandingPageProps) {
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');

  // Plan Comparison & Estimator state
  const [compareIds, setCompareIds] = useState<number[]>([]);
  const [estAge, setEstAge] = useState(32);
  const [estMembers, setEstMembers] = useState(2);

  // Partner Hospitals directory
  const [hospitals, setHospitals] = useState<PartnerHospitalRecord[]>([]);
  const [loadingHospitals, setLoadingHospitals] = useState(true);
  const [hospitalsError, setHospitalsError] = useState('');
  const [hospitalSearch, setHospitalSearch] = useState('');
  const [hospitalCity, setHospitalCity] = useState('All');

  // Inquiry form state
  const [inqName, setInqName] = useState('');
  const [inqEmail, setInqEmail] = useState('');
  const [inqPhone, setInqPhone] = useState('');
  const [inqCategory, setInqCategory] = useState('Family Floater');
  const [inqMessage, setInqMessage] = useState('');
  const [inqSubmitting, setInqSubmitting] = useState(false);
  const [inqError, setInqError] = useState('');
  const [inqFieldErrors, setInqFieldErrors] = useState<Record<string, string>>({});
  const [inqSuccess, setInqSuccess] = useState('');

  function loadHospitals() {
    setLoadingHospitals(true);
    setHospitalsError('');
    api
      .getHospitals()
      .then((res) => setHospitals(res.hospitals ?? []))
      .catch((err) => {
        setHospitalsError(
          err instanceof Error ? err.message : 'Unable to load partner hospitals.'
        );
      })
      .finally(() => setLoadingHospitals(false));
  }

  useEffect(() => {
    loadHospitals();
  }, []);

  const filteredPolicies = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return policies.filter((p) => {
      const catOk = selectedCategory === 'All' || p.category === selectedCategory;
      const qOk =
        !q ||
        p.policy_name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q) ||
        (p.highlights || '').toLowerCase().includes(q);
      return catOk && qOk;
    });
  }, [policies, selectedCategory, searchQuery]);

  const comparedPolicies = useMemo(
    () => policies.filter((p) => compareIds.includes(p.policy_id)),
    [policies, compareIds]
  );

  const hospitalCities = useMemo(
    () => ['All', ...Array.from(new Set(hospitals.map((h) => h.city)))],
    [hospitals]
  );

  const filteredHospitals = useMemo(() => {
    const q = hospitalSearch.trim().toLowerCase();
    return hospitals.filter((h) => {
      const cityOk = hospitalCity === 'All' || h.city === hospitalCity;
      const qOk =
        !q ||
        h.hospital_name.toLowerCase().includes(q) ||
        h.city.toLowerCase().includes(q) ||
        h.specialty.toLowerCase().includes(q);
      return cityOk && qOk;
    });
  }, [hospitals, hospitalCity, hospitalSearch]);

  function toggleCompare(policyId: number) {
    setCompareIds((prev) => {
      if (prev.includes(policyId)) {
        return prev.filter((id) => id !== policyId);
      }
      if (prev.length >= 3) {
        return [...prev.slice(1), policyId];
      }
      return [...prev, policyId];
    });
  }

  async function handleInquirySubmit(e: FormEvent) {
    e.preventDefault();
    setInqError('');
    setInqSuccess('');
    setInqFieldErrors({});

    const check = validateInquiryInput({
      full_name: inqName,
      email: inqEmail,
      phone: inqPhone,
      preferred_category: inqCategory,
    });
    if (!check.valid) {
      setInqFieldErrors(check.errors);
      setInqError(Object.values(check.errors)[0]);
      return;
    }

    setInqSubmitting(true);
    try {
      const res = await api.submitInquiry({
        full_name: inqName.trim(),
        email: inqEmail.trim(),
        phone: inqPhone.trim(),
        preferred_category: inqCategory,
        message: inqMessage.trim(),
      });
      setInqSuccess(res.message);
      setInqName('');
      setInqEmail('');
      setInqPhone('');
      setInqMessage('');
    } catch (err) {
      if (err instanceof ApiError) {
        setInqError(err.message);
      } else {
        setInqError('Could not submit inquiry. Please try again.');
      }
    } finally {
      setInqSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#f7f5ee] text-[#17261f]">
      {/* Top Bar Contract: 3 zones separated by gap-8 */}
      <header className="sticky top-0 z-30 border-b border-[#e4e6d9] bg-[#f7f5ee]/95 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between gap-8">
          <a
            href="#top"
            className="font-display text-lg font-bold tracking-tight text-[#0f172a] whitespace-nowrap shrink-0 flex items-center gap-2"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#d7ed78] text-[11px] font-black text-[#18342b]">
              P.
            </span>
            PolicyPulse
          </a>

          <nav
            aria-label="Primary navigation"
            className="hidden md:flex items-center gap-7 text-sm font-medium text-[#52625a]"
          >
            <a
              href="#plans"
              className="hover:text-[#587b38] hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              Health Plans
            </a>
            <a
              href="#network"
              className="hover:text-[#587b38] hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              Hospitals
            </a>
            <a
              href="#workflow"
              className="hover:text-[#587b38] hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              How It Works
            </a>
            <a
              href="#quote"
              className="hover:text-[#587b38] hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              Request Quote
            </a>
          </nav>

          <div className="shrink-0">
            {currentUser ? (
              <button
                type="button"
                onClick={onOpenPortal}
                className="rounded-full bg-[#18342b] px-5 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-[#294d3f] sm:text-sm"
              >
                Open Dashboard
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onOpenAuth('login')}
                className="rounded-full bg-[#18342b] px-5 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-[#294d3f] sm:text-sm"
              >
                Member Portal
              </button>
            )}
          </div>
        </div>
      </header>

      <main id="top">
        <section className="overflow-hidden border-b border-[#dfe5d6] bg-[#e7eddf]">
          <div className="mx-auto max-w-7xl px-6 py-10 lg:py-16">
            <div className="grid items-center gap-10 lg:grid-cols-[1.05fr_0.95fr]">
              <div className="py-4 lg:py-10">
                <p className="inline-flex items-center gap-2 rounded-full border border-[#cbd8bb] bg-[#f7f5ee] px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-[#55713d]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#83a653]" />
                  A more human kind of cover
                </p>
                <h1
                  className="mt-6 max-w-2xl font-display text-5xl font-semibold leading-[1.02] tracking-[-0.045em] text-[#18342b] sm:text-6xl lg:text-7xl"
                  style={{ textWrap: 'balance' }}
                >
                  Good care starts with a <span className="text-[#75934e]">clear plan.</span>
                </h1>
                <p className="mt-6 max-w-lg text-base leading-7 text-[#52625a]">
                  Less decoding. More peace of mind. Find a health plan that fits your life,
                  then keep every application and claim in one calm, simple place.
                </p>

                <div className="mt-8 flex flex-wrap items-center gap-3">
                  <a
                    href="#plans"
                    className="inline-flex items-center gap-3 rounded-full bg-[#18342b] px-6 py-3.5 text-sm font-semibold text-white transition-all hover:bg-[#294d3f]"
                  >
                    <span>Find your plan</span>
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </a>
                  <button
                    type="button"
                    onClick={() => currentUser ? onOpenPortal() : onOpenAuth('register')}
                    className="rounded-full border border-[#bdcbb4] bg-transparent px-5 py-3.5 text-sm font-semibold text-[#294d3f] transition-colors hover:bg-[#f7f5ee]"
                  >
                    {currentUser ? 'Open my account' : 'Create an account'}
                  </button>
                </div>

                <div className="mt-10 flex items-center gap-3 text-xs text-[#52625a]">
                  <div className="flex -space-x-2">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-[#e7eddf] bg-[#e9a98b] text-[10px] font-bold text-[#3d302a]">AN</span>
                    <span className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-[#e7eddf] bg-[#d7ed78] text-[10px] font-bold text-[#294d3f]">RK</span>
                    <span className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-[#e7eddf] bg-[#b7c8e8] text-[10px] font-bold text-[#29364a]">MJ</span>
                  </div>
                  <span><strong className="text-[#18342b]">Care, without the guesswork.</strong><br />Built for real-life health decisions.</span>
                </div>
              </div>

              <div className="relative mx-auto w-full max-w-[500px] py-6 lg:py-0">
                <div className="absolute -right-12 -top-10 h-48 w-48 rounded-full bg-[#d7ed78] opacity-70 blur-2xl" />
                <div className="absolute -bottom-8 -left-10 h-44 w-44 rounded-full bg-[#e9a98b] opacity-50 blur-2xl" />
                <div className="relative rounded-[34px] bg-[#18342b] p-5 text-white shadow-[0_30px_70px_rgba(24,52,43,0.24)] sm:p-7">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#c5d5b6]">Your care, in one place</p>
                      <p className="mt-2 font-display text-2xl font-semibold tracking-tight">Coverage that feels clear.</p>
                    </div>
                    <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#d7ed78] text-[#18342b]">
                      <HeartPulse className="h-5 w-5" aria-hidden="true" />
                    </span>
                  </div>

                  <div className="mt-7 rounded-[24px] bg-[#f7f5ee] p-5 text-[#18342b]">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-[#66766b]">A good place to start</span>
                      <span className="rounded-full bg-[#e5eddb] px-2.5 py-1 text-[10px] font-bold text-[#55713d]">HEALTH PLAN</span>
                    </div>
                    <p className="mt-4 font-display text-xl font-semibold">Cover the moments that matter.</p>
                    <div className="mt-5 grid grid-cols-2 gap-3">
                      <div className="rounded-2xl bg-white p-3.5">
                        <p className="text-[10px] uppercase tracking-wider text-[#7b887e]">Explore</p>
                        <p className="mt-1 text-sm font-semibold">Plans for your life</p>
                      </div>
                      <div className="rounded-2xl bg-white p-3.5">
                        <p className="text-[10px] uppercase tracking-wider text-[#7b887e]">Keep track</p>
                        <p className="mt-1 text-sm font-semibold">Claims, made simple</p>
                      </div>
                    </div>
                    <div className="mt-4 flex items-center gap-3 border-t border-[#e7e8df] pt-4">
                      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#d7ed78]"><Check className="h-4 w-4" aria-hidden="true" /></span>
                      <span className="text-xs leading-5 text-[#52625a]">From choosing cover to checking a claim,<br />everything stays together.</span>
                    </div>
                  </div>

                  <div className="mt-5 flex items-center justify-between text-xs text-[#c5d5b6]">
                    <span>Thoughtful cover. Straightforward care.</span>
                    <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                  </div>
                </div>
              </div>
            </div>

            {/* Full-Width 4-Column Proof Strip with colorful icons */}
            <div className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div className="rounded-[20px] border border-[#e4e6d9] bg-[#fbfaf6] p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-mono text-2xl font-bold text-[#18342b] tabular-nums sm:text-3xl">
                    450+
                  </p>
                  <p className="mt-1 text-sm text-[#66766b]">Cashless Partner Hospitals</p>
                </div>
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#e7eddf] text-[#55713d]">
                  <Building2 className="w-4 h-4" aria-hidden="true" />
                </span>
              </div>
            </div>

            <div className="rounded-[20px] border border-[#e4e6d9] bg-[#fbfaf6] p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-mono text-2xl font-bold text-[#55713d] tabular-nums sm:text-3xl">
                    98.4%
                  </p>
                  <p className="mt-1 text-sm text-[#66766b]">Verified Claim Settlement Rate</p>
                </div>
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#e7eddf] text-[#55713d]">
                  <ShieldCheck className="w-4 h-4" aria-hidden="true" />
                </span>
              </div>
            </div>

            <div className="rounded-[20px] border border-[#e4e6d9] bg-[#fbfaf6] p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-mono text-2xl font-bold text-[#a75e47] tabular-nums sm:text-3xl">
                    24 hrs
                  </p>
                  <p className="mt-1 text-sm text-[#66766b]">Average Initial Claim Review</p>
                </div>
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#f7e9df] text-[#a75e47]">
                  <Clock className="w-4 h-4" aria-hidden="true" />
                </span>
              </div>
            </div>

            <div className="rounded-[20px] border border-[#e4e6d9] bg-[#fbfaf6] p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-mono text-2xl font-bold text-[#a75e47] tabular-nums sm:text-3xl">
                    {policies.length} Tiers
                  </p>
                  <p className="mt-1 text-sm text-[#66766b]">Individual to Senior Coverage</p>
                </div>
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#f7e9df] text-[#a75e47]">
                  <HeartPulse className="w-4 h-4" aria-hidden="true" />
                </span>
              </div>
            </div>
          </div>
          </div>
        </section>

        {/* Policy Catalogue & Interactive Plan Comparison Section */}
        <section id="plans" className="max-w-7xl mx-auto px-6 py-16">
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#75934e]">
                Find your fit
              </p>
              <h2 className="mt-2 font-display text-3xl font-semibold tracking-tight text-[#18342b] sm:text-4xl">
                Cover that makes sense for you
              </h2>
              <p className="mt-2 text-[15px] text-[#66766b] max-w-2xl">
                Every policy displays its monthly premium, annual coverage limit, and coverage
                highlights upfront. Select up to three plans to compare estimated premiums.
              </p>
            </div>

            <div className="relative w-full lg:w-72 shrink-0">
              <Search
                className="w-4 h-4 text-[#64748B] absolute left-3.5 top-1/2 -translate-y-1/2"
                aria-hidden="true"
              />
              <input
                type="search"
                name="policy-catalogue-search"
                autoComplete="off"
                aria-label="Search health insurance plans"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search plans or coverage..."
                className="w-full pl-10 pr-4 py-3 bg-[#fbfaf6] border border-[#d9ded0] rounded-full text-sm text-[#18342b] focus:outline-none focus:border-[#8aa36c] focus:ring-2 focus:ring-[#8aa36c]/15"
              />
            </div>
          </div>

          {/* Interactive Category Filter Tabs */}
          <div
            className="mt-6 flex flex-wrap items-center gap-1.5 p-1.5 bg-[#e9e9df] rounded-full w-fit max-w-full"
            role="tablist"
            aria-label="Filter policies by category"
          >
            {CATEGORIES.map((category) => {
              const active = selectedCategory === category;
              return (
                <button
                  key={category}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setSelectedCategory(category)}
                  className={`px-3.5 py-1.5 text-xs sm:text-sm font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                    active
                      ? 'bg-[#18342b] text-[#f7f5ee] shadow-sm'
                      : 'text-[#52625a] hover:text-[#18342b]'
                  }`}
                >
                  {category}
                </button>
              );
            })}
          </div>

          {/* Side-by-Side Plan Comparison & Estimator Panel */}
          {comparedPolicies.length > 0 && (
            <div
              className="mt-6 bg-white border border-[#2563EB]/40 rounded-2xl p-6 space-y-5 shadow-sm"
              aria-label="Plan comparison and premium estimator"
            >
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-[#E2E8F0] pb-4">
                <div>
                  <h3 className="font-display text-lg font-bold text-[#0E1A40]">
                    Side-by-Side Plan Comparison ({comparedPolicies.length}/3)
                  </h3>
                  <p className="text-xs text-[#475569]">
                    Adjust age and household size below for an illustrative monthly estimate.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-4">
                  <label className="flex items-center gap-2 text-xs font-medium text-[#1E293B]">
                    <span>Applicant Age</span>
                    <input
                      type="number"
                      min={18}
                      max={99}
                      value={estAge}
                      onChange={(e) => setEstAge(Number(e.target.value) || 18)}
                      className="w-16 px-2 py-1.5 bg-[#F8FAFC] border border-[#CBD5E1] rounded-md font-mono tabular-nums focus:outline-none focus:border-[#2563EB]"
                    />
                  </label>
                  <label className="flex items-center gap-2 text-xs font-medium text-[#1E293B]">
                    <span>Members</span>
                    <input
                      type="number"
                      min={1}
                      max={6}
                      value={estMembers}
                      onChange={(e) => setEstMembers(Number(e.target.value) || 1)}
                      className="w-16 px-2 py-1.5 bg-[#F8FAFC] border border-[#CBD5E1] rounded-md font-mono tabular-nums focus:outline-none focus:border-[#2563EB]"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => setCompareIds([])}
                    className="text-xs font-semibold text-[#64748B] hover:text-[#E11D48]"
                  >
                    Clear All
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[600px]">
                  <thead>
                    <tr className="border-b border-[#E2E8F0] text-xs font-semibold text-[#475569]">
                      <th className="py-2.5 pr-4">Feature</th>
                      {comparedPolicies.map((p) => (
                        <th key={p.policy_id} className="py-2.5 px-4 text-[#0E1A40]">
                          <div className="flex items-center justify-between gap-2">
                            <span>{p.policy_name}</span>
                            <button
                              type="button"
                              aria-label={`Remove ${p.policy_name} from comparison`}
                              onClick={() => toggleCompare(p.policy_id)}
                              className="p-1 text-[#64748B] hover:text-[#E11D48]"
                            >
                              <X className="w-3.5 h-3.5" aria-hidden="true" />
                            </button>
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F1F5F9] text-sm">
                    <tr>
                      <td className="py-2.5 pr-4 text-xs text-[#64748B]">Category</td>
                      {comparedPolicies.map((p) => (
                        <td key={p.policy_id} className="py-2.5 px-4">
                          {p.category}
                        </td>
                      ))}
                    </tr>
                    <tr>
                      <td className="py-2.5 pr-4 text-xs text-[#64748B]">Base Monthly</td>
                      {comparedPolicies.map((p) => (
                        <td
                          key={p.policy_id}
                          className="py-2.5 px-4 font-mono tabular-nums"
                        >
                          {formatCurrency(p.premium_amount)}
                        </td>
                      ))}
                    </tr>
                    <tr>
                      <td className="py-2.5 pr-4 text-xs text-[#64748B]">
                        Estimated Monthly ({estMembers} member{estMembers > 1 ? 's' : ''}, age{' '}
                        {estAge})
                      </td>
                      {comparedPolicies.map((p) => (
                        <td
                          key={p.policy_id}
                          className="py-2.5 px-4 font-mono font-bold text-[#2563EB] tabular-nums"
                        >
                          {formatCurrency(
                            calculateEstimatedPremium(p.premium_amount, estAge, estMembers)
                          )}
                        </td>
                      ))}
                    </tr>
                    <tr>
                      <td className="py-2.5 pr-4 text-xs text-[#64748B]">Annual Coverage</td>
                      {comparedPolicies.map((p) => (
                        <td
                          key={p.policy_id}
                          className="py-2.5 px-4 font-mono font-semibold text-[#059669] tabular-nums"
                        >
                          {formatCurrency(p.coverage_amount)}
                        </td>
                      ))}
                    </tr>
                    <tr>
                      <td className="py-2.5 pr-4 text-xs text-[#64748B]">Action</td>
                      {comparedPolicies.map((p) => (
                        <td key={p.policy_id} className="py-2.5 px-4">
                          <button
                            type="button"
                            onClick={() => onApplyPolicy(p.policy_id)}
                            className="px-3 py-1.5 bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-semibold rounded-md whitespace-nowrap"
                          >
                            Apply Now
                          </button>
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {loadingPolicies ? (
            <div className="mt-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3].map((n) => (
                <div
                  key={n}
                  className="h-72 bg-white border border-[#E2E8F0] rounded-2xl p-6 animate-pulse"
                />
              ))}
            </div>
          ) : policiesError && policies.length === 0 ? (
            <div className="mt-8 bg-white border border-[#FECACA] rounded-2xl p-10 text-center">
              <p className="text-base font-semibold text-[#0E1A40]">
                Unable to load health plans right now.
              </p>
              <p className="mt-1 text-sm text-[#475569]">{policiesError}</p>
              {onRetryPolicies && (
                <button
                  type="button"
                  onClick={onRetryPolicies}
                  className="mt-4 px-4 py-2 text-sm font-semibold text-white bg-[#2563EB] rounded-lg hover:bg-[#1D4ED8] transition-colors"
                >
                  Retry Loading Plans
                </button>
              )}
            </div>
          ) : filteredPolicies.length === 0 ? (
            <div className="mt-8 bg-white border border-[#E2E8F0] rounded-2xl p-10 text-center">
              <p className="text-base font-semibold text-[#0E1A40]">
                No policies match your current filter.
              </p>
              <p className="mt-1 text-sm text-[#475569]">
                Clear the search box or select All categories to view all plans.
              </p>
              <button
                type="button"
                onClick={() => {
                  setSelectedCategory('All');
                  setSearchQuery('');
                }}
                className="mt-4 px-4 py-2 text-sm font-semibold text-white bg-[#2563EB] rounded-lg hover:bg-[#1D4ED8] transition-colors"
              >
                Reset Filters
              </button>
            </div>
          ) : (
            <div className="mt-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredPolicies.map((policy) => {
                const isCompared = compareIds.includes(policy.policy_id);
                const accent = getCategoryAccent(policy.category);
                return (
                  <article
                    key={policy.policy_id}
                    className={`bg-[#fbfaf6] border rounded-[26px] overflow-hidden flex flex-col justify-between transition-all duration-200 hover:-translate-y-1 ${
                      isCompared
                        ? 'border-[#829a63] shadow-[0_16px_40px_rgba(24,52,43,0.12)]'
                        : 'border-[#e4e6d9] hover:border-[#b6c4a8] hover:shadow-[0_16px_40px_rgba(24,52,43,0.08)]'
                    }`}
                  >
                    <div className={`h-2 w-full ${accent.bar}`} aria-hidden="true" />
                    <div className="p-7 flex-1 flex flex-col justify-between">
                      <div>
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <span className={`font-semibold ${accent.text}`}>
                            {policy.category} ·{' '}
                            <span className="font-mono text-[#64748B] font-normal tabular-nums">
                              {policy.term_months}-Mo Term
                            </span>
                          </span>
                          <button
                            type="button"
                            onClick={() => toggleCompare(policy.policy_id)}
                            aria-pressed={isCompared}
                            className={`inline-flex items-center gap-1 text-xs font-medium transition-colors whitespace-nowrap ${
                              isCompared
                                ? 'text-[#2563EB] font-semibold'
                                : 'text-[#64748B] hover:text-[#0E1A40]'
                            }`}
                          >
                            <Scale className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>{isCompared ? 'Comparing' : 'Compare'}</span>
                          </button>
                        </div>

                        <h3 className="mt-2.5 font-display text-xl font-bold text-[#0E1A40]">
                          {policy.policy_name}
                        </h3>

                        <div className="mt-4 pb-4 border-b border-[#F1F5F9] flex items-baseline justify-between gap-4">
                          <div>
                            <span className="font-mono text-2xl font-bold text-[#0E1A40] tabular-nums">
                              {formatCurrency(policy.premium_amount)}
                            </span>
                            <span className="text-xs text-[#64748B]"> / month</span>
                          </div>
                          <div className="text-right">
                            <span className="block text-[11px] text-[#64748B]">
                              Annual Limit
                            </span>
                            <span className="font-mono text-sm font-bold text-[#059669] tabular-nums">
                              {formatCurrency(policy.coverage_amount)}
                            </span>
                          </div>
                        </div>

                        <p className="mt-4 text-sm text-[#475569] leading-relaxed">
                          {policy.description}
                        </p>

                        {policy.highlights && (
                          <p className="mt-3 text-xs text-[#475569] leading-relaxed">
                            {policy.highlights}
                          </p>
                        )}
                      </div>

                      <div className="mt-6 pt-4 border-t border-[#F1F5F9]">
                        <button
                          type="button"
                          onClick={() => onApplyPolicy(policy.policy_id)}
                          className="w-full py-2.5 px-4 bg-[#0E1A40] hover:bg-[#2563EB] text-white text-sm font-semibold rounded-lg transition-colors whitespace-nowrap"
                        >
                          Apply for {policy.policy_name}
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        {/* Partner Hospital Network Directory */}
        <section id="network" className="max-w-7xl mx-auto px-6 py-14 border-t border-[#E2E8F0]">
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-[#059669]">
                Cashless Provider Directory
              </p>
              <h2 className="mt-2 font-display text-3xl font-bold tracking-tight text-[#0E1A40]">
                Verified partner hospitals &amp; clinics
              </h2>
              <p className="mt-2 text-[15px] text-[#475569] max-w-2xl">
                Search participating hospitals and diagnostic centers supported for direct claim
                intake and cashless billing desks.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 w-full lg:w-auto">
              <div className="relative sm:w-60">
                <Search
                  className="w-4 h-4 text-[#64748B] absolute left-3 top-1/2 -translate-y-1/2"
                  aria-hidden="true"
                />
                <input
                  type="search"
                  name="partner-hospital-search"
                  autoComplete="off"
                  aria-label="Search partner hospitals"
                  value={hospitalSearch}
                  onChange={(e) => setHospitalSearch(e.target.value)}
                  placeholder="Hospital or specialty..."
                  className="w-full pl-9 pr-3 py-2 bg-white border border-[#CBD5E1] rounded-lg text-sm focus:outline-none focus:border-[#2563EB]"
                />
              </div>
              <select
                aria-label="Filter hospitals by city"
                value={hospitalCity}
                onChange={(e) => setHospitalCity(e.target.value)}
                className="px-3.5 py-2 bg-white border border-[#CBD5E1] rounded-lg text-sm focus:outline-none focus:border-[#2563EB]"
              >
                {hospitalCities.map((city) => (
                  <option key={city} value={city}>
                    {city === 'All' ? 'All Cities' : city}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-8 bg-white border border-[#E2E8F0] rounded-2xl overflow-x-auto shadow-xs">
            {loadingHospitals ? (
              <div className="p-8 text-center text-sm text-[#64748B]">
                Loading partner hospitals...
              </div>
            ) : hospitalsError && hospitals.length === 0 ? (
              <div className="p-8 text-center text-sm text-[#64748B] space-y-3">
                <p>Unable to load partner hospitals ({hospitalsError}).</p>
                <button
                  type="button"
                  onClick={loadHospitals}
                  className="px-4 py-2 text-xs font-semibold text-white bg-[#2563EB] rounded-lg hover:bg-[#1D4ED8] transition-colors"
                >
                  Retry
                </button>
              </div>
            ) : filteredHospitals.length === 0 ? (
              <div className="p-8 text-center text-sm text-[#64748B]">
                No partner hospitals match your search.
              </div>
            ) : (
              <table className="w-full text-left border-collapse min-w-[640px]">
                <thead>
                  <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC] text-xs font-semibold text-[#475569]">
                    <th className="py-3.5 px-5">Hospital / Clinic</th>
                    <th className="py-3.5 px-5">City</th>
                    <th className="py-3.5 px-5">Primary Specialty</th>
                    <th className="py-3.5 px-5">Emergency Desk</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F1F5F9] text-sm">
                  {filteredHospitals.map((h) => (
                    <tr key={h.hospital_id} className="hover:bg-[#F8FAFF]">
                      <td className="py-3.5 px-5 font-semibold text-[#0E1A40]">
                        {h.hospital_name}
                      </td>
                      <td className="py-3.5 px-5 text-[#475569]">{h.city}</td>
                      <td className="py-3.5 px-5 text-[#2563EB] font-medium">{h.specialty}</td>
                      <td className="py-3.5 px-5 font-mono text-xs text-[#059669] font-semibold tabular-nums">
                        {h.emergency_phone}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>

        {/* Asymmetric Capabilities Bento Section */}
        <section id="workflow" className="max-w-7xl mx-auto px-6 py-14 border-t border-[#E2E8F0]">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-wider text-[#4F46E5]">
              How PolicyPulse Works
            </p>
            <h2 className="mt-2 font-display text-3xl font-bold tracking-tight text-[#0E1A40]">
              One unified system for members and underwriters
            </h2>
          </div>

          <div className="mt-8 grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 bg-white border border-[#E2E8F0] rounded-2xl overflow-hidden shadow-xs">
              <div className="p-8 h-full flex flex-col justify-between">
                <div>
                  <span className="w-10 h-10 rounded-xl bg-[#EFF6FF] text-[#2563EB] flex items-center justify-center mb-4">
                    <Shield className="w-5 h-5" aria-hidden="true" />
                  </span>
                  <h3 className="font-display text-xl font-bold text-[#0E1A40]">
                    01. Digital Policy Enrollment &amp; Billing
                  </h3>
                  <p className="mt-3 text-sm text-[#475569] leading-relaxed">
                    Members register once, select any active plan from the catalogue, nominate a
                    beneficiary, record premium payments, and download official receipts.
                  </p>
                </div>
                <div className="mt-6 pt-4 border-t border-[#F1F5F9] text-xs font-medium text-[#2563EB]">
                  Instant database confirmation · Downloadable receipts
                </div>
              </div>
            </div>

            <div className="bg-gradient-to-br from-[#0E1A40] via-[#172B69] to-[#1E3A8A] text-white rounded-2xl p-8 flex flex-col justify-between shadow-sm">
              <div>
                <span className="w-10 h-10 rounded-xl bg-[#2563EB] text-white flex items-center justify-center mb-4">
                  <Activity className="w-5 h-5" aria-hidden="true" />
                </span>
                <h3 className="font-display text-xl font-bold">
                  02. Administrative Review &amp; Audit
                </h3>
                <p className="mt-3 text-sm text-[#CBD5E1] leading-relaxed">
                  Administrators review customer applications, analyze category trends, inspect
                  multi-stage claim timelines, and audit security logs.
                </p>
              </div>
              <button
                type="button"
                onClick={() => (currentUser ? onOpenPortal() : onOpenAuth('login'))}
                className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-[#93C5FD] hover:text-white transition-colors whitespace-nowrap"
              >
                <span>Access Role-Based Portal</span>
                <ArrowRight className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>

            <div className="bg-white border border-[#E2E8F0] rounded-2xl p-8 flex flex-col justify-between shadow-xs">
              <div>
                <span className="w-10 h-10 rounded-xl bg-[#ECFDF5] text-[#059669] flex items-center justify-center mb-4">
                  <Check className="w-5 h-5" aria-hidden="true" />
                </span>
                <h3 className="font-display text-xl font-bold text-[#0E1A40]">
                  03. Claim Inspection &amp; Alerts
                </h3>
                <p className="mt-3 text-sm text-[#475569] leading-relaxed">
                  Active policyholders submit hospital details, treatment dates, and itemized
                  invoices—tracking every review stage and case note in real time.
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-[#F1F5F9] text-xs font-medium text-[#059669]">
                Pending · Under Review · Approved · Rejected
              </div>
            </div>

            <div className="lg:col-span-2 bg-white border border-[#E2E8F0] rounded-2xl overflow-hidden shadow-xs">
              <div className="p-8 h-full flex flex-col justify-between">
                <div>
                  <span className="w-10 h-10 rounded-xl bg-[#EEF2FF] text-[#4F46E5] flex items-center justify-center mb-4">
                    <Users className="w-5 h-5" aria-hidden="true" />
                  </span>
                  <h3 className="font-display text-xl font-bold text-[#0E1A40]">
                    04. Senior &amp; Preventive Care Continuity
                  </h3>
                  <p className="mt-3 text-sm text-[#475569] leading-relaxed">
                    Dedicated plans for senior citizens and preventive dental or vision checkups
                    keep long-term family healthcare organized in a single member record.
                  </p>
                </div>
                <div className="mt-6 pt-4 border-t border-[#F1F5F9] text-xs font-medium text-[#4F46E5]">
                  Single member ledger across every active plan
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Member Stories & Outcomes */}
        <section id="stories" className="max-w-7xl mx-auto px-6 py-14 border-t border-[#E2E8F0]">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-wider text-[#2563EB]">
              Verified Member Outcomes
            </p>
            <h2 className="mt-2 font-display text-3xl font-bold tracking-tight text-[#0E1A40]">
              Built around real claim timelines
            </h2>
          </div>

          <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6">
            <blockquote className="bg-white border border-[#E2E8F0] rounded-2xl p-6 flex flex-col justify-between shadow-xs">
              <p className="text-sm text-[#334155] leading-relaxed">
                &ldquo;We moved from paper claim folders to PolicyPulse before our daughter&apos;s
                ear procedure. Our Family Floater claim moved from Pending to Approved in under 18
                hours.&rdquo;
              </p>
              <footer className="mt-6 pt-4 border-t border-[#F1F5F9]">
                <p className="text-sm font-semibold text-[#0E1A40]">Aarav Sharma</p>
                <p className="text-xs text-[#2563EB] font-medium">
                  Family Floater Shield · Approved claim $1,850
                </p>
              </footer>
            </blockquote>

            <blockquote className="bg-white border border-[#E2E8F0] rounded-2xl p-6 flex flex-col justify-between shadow-xs">
              <p className="text-sm text-[#334155] leading-relaxed">
                &ldquo;Having my parents&apos; Senior Care application status and reviewer remarks
                visible on one screen eliminated repeated phone follow-ups with clinic
                billing.&rdquo;
              </p>
              <footer className="mt-6 pt-4 border-t border-[#F1F5F9]">
                <p className="text-sm font-semibold text-[#0E1A40]">Priya Menon</p>
                <p className="text-xs text-[#059669] font-medium">
                  Essential Care Individual · Active member since 2026
                </p>
              </footer>
            </blockquote>

            <blockquote className="bg-white border border-[#E2E8F0] rounded-2xl p-6 flex flex-col justify-between shadow-xs">
              <p className="text-sm text-[#334155] leading-relaxed">
                &ldquo;Policy limits, monthly premiums, and nominee details are stored cleanly in
                one database. Updating a plan tier or auditing pending claims takes seconds.&rdquo;
              </p>
              <footer className="mt-6 pt-4 border-t border-[#F1F5F9]">
                <p className="text-sm font-semibold text-[#0E1A40]">Elena Vance</p>
                <p className="text-xs text-[#4F46E5] font-medium">
                  Lead Underwriting Administrator · PolicyPulse Operations
                </p>
              </footer>
            </blockquote>
          </div>
        </section>

        {/* Interactive Lead Capture / Quote Section */}
        <section id="quote" className="max-w-7xl mx-auto px-6 py-14 border-t border-[#E2E8F0]">
          <div className="bg-white border border-[#E2E8F0] rounded-2xl p-8 sm:p-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start shadow-xs">
            <div className="lg:col-span-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-[#2563EB]">
                Coverage Advisor
              </p>
              <h2 className="mt-2 font-display text-3xl font-bold tracking-tight text-[#0E1A40]">
                Request a personalized plan recommendation
              </h2>
              <p className="mt-3 text-[15px] text-[#475569] leading-relaxed">
                Share your preferred coverage category and contact details. Inquiries are saved to
                our administrative queue for direct advisor follow-up.
              </p>
              <ul className="mt-6 space-y-2.5 text-sm text-[#334155]">
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-[#2563EB] shrink-0" aria-hidden="true" />
                  <span>Transparent monthly premium breakdowns</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-[#059669] shrink-0" aria-hidden="true" />
                  <span>Family &amp; senior eligibility guidance</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-[#4F46E5] shrink-0" aria-hidden="true" />
                  <span>Direct portal onboarding assistance</span>
                </li>
              </ul>
            </div>

            <form
              onSubmit={handleInquirySubmit}
              noValidate
              className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-4"
            >
              {inqSuccess && (
                <div
                  role="status"
                  className="sm:col-span-2 p-4 rounded-lg bg-[#ECFDF5] border border-[#A7F3D0] text-sm text-[#047857]"
                >
                  {inqSuccess}
                </div>
              )}
              {inqError && (
                <div
                  role="alert"
                  className="sm:col-span-2 p-4 rounded-lg bg-[#FFF1F2] border border-[#FECDD3] text-sm text-[#BE123C]"
                >
                  {inqError}
                </div>
              )}

              <div>
                <label
                  htmlFor="inq-name"
                  className="block text-sm font-medium text-[#1E293B] mb-1.5"
                >
                  Full Name
                </label>
                <input
                  id="inq-name"
                  type="text"
                  value={inqName}
                  onChange={(e) => setInqName(e.target.value)}
                  placeholder="Kiran Rao"
                  className="w-full px-3.5 py-2.5 bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-sm focus:bg-white focus:outline-none focus:border-[#2563EB]"
                />
                {inqFieldErrors.full_name && (
                  <p className="mt-1 text-xs text-[#BE123C]">{inqFieldErrors.full_name}</p>
                )}
              </div>

              <div>
                <label
                  htmlFor="inq-email"
                  className="block text-sm font-medium text-[#1E293B] mb-1.5"
                >
                  Email Address
                </label>
                <input
                  id="inq-email"
                  type="email"
                  value={inqEmail}
                  onChange={(e) => setInqEmail(e.target.value)}
                  placeholder="kiran@example.com"
                  className="w-full px-3.5 py-2.5 bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-sm focus:bg-white focus:outline-none focus:border-[#2563EB]"
                />
                {inqFieldErrors.email && (
                  <p className="mt-1 text-xs text-[#BE123C]">{inqFieldErrors.email}</p>
                )}
              </div>

              <div>
                <label
                  htmlFor="inq-phone"
                  className="block text-sm font-medium text-[#1E293B] mb-1.5"
                >
                  Phone Number
                </label>
                <input
                  id="inq-phone"
                  type="tel"
                  value={inqPhone}
                  onChange={(e) => setInqPhone(e.target.value)}
                  placeholder="+1 415 555 0144"
                  className="w-full px-3.5 py-2.5 bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-sm focus:bg-white focus:outline-none focus:border-[#2563EB]"
                />
                {inqFieldErrors.phone && (
                  <p className="mt-1 text-xs text-[#BE123C]">{inqFieldErrors.phone}</p>
                )}
              </div>

              <div>
                <label
                  htmlFor="inq-category"
                  className="block text-sm font-medium text-[#1E293B] mb-1.5"
                >
                  Coverage Category
                </label>
                <select
                  id="inq-category"
                  value={inqCategory}
                  onChange={(e) => setInqCategory(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-sm focus:bg-white focus:outline-none focus:border-[#2563EB]"
                >
                  {CATEGORIES.filter((c) => c !== 'All').map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-2">
                <label
                  htmlFor="inq-message"
                  className="block text-sm font-medium text-[#1E293B] mb-1.5"
                >
                  Family Size or Coverage Notes (Optional)
                </label>
                <textarea
                  id="inq-message"
                  rows={3}
                  value={inqMessage}
                  onChange={(e) => setInqMessage(e.target.value)}
                  placeholder="Tell us about household members or preferred hospital network..."
                  className="w-full px-3.5 py-2.5 bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-sm focus:bg-white focus:outline-none focus:border-[#2563EB]"
                />
              </div>

              <div className="sm:col-span-2 flex justify-end">
                <button
                  type="submit"
                  disabled={inqSubmitting}
                  className="px-6 py-2.5 bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-60 text-white text-sm font-semibold rounded-lg transition-colors whitespace-nowrap shadow-xs"
                >
                  {inqSubmitting ? 'Submitting Inquiry...' : 'Request Coverage Callback'}
                </button>
              </div>
            </form>
          </div>
        </section>
      </main>

      <footer className="border-t border-[#E2E8F0] bg-[#0E1A40] text-white">
        <div className="max-w-7xl mx-auto px-6 py-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-xs text-[#CBD5E1]">
          <div>
            <span className="font-display font-bold text-sm text-white">PolicyPulse</span>
            <span className="ml-3">
              Demonstrative Health Insurance Management System (illustrative plans &amp; records).
            </span>
          </div>
          <div className="flex items-center gap-6">
            <a href="#plans" className="hover:text-white">
              Plans
            </a>
            <a href="#network" className="hover:text-white">
              Hospitals
            </a>
            <a href="#workflow" className="hover:text-white">
              Workflow
            </a>
            <button
              type="button"
              onClick={() => (currentUser ? onOpenPortal() : onOpenAuth('login'))}
              className="hover:text-white"
            >
              Portal Sign In
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
