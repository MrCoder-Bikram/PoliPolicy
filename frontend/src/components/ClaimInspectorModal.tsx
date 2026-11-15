import { useEffect, useState, type FormEvent } from 'react';
import {
  AlertCircle,
  Check,
  Clock,
  FileText,
  Plus,
  Shield,
  X,
} from 'lucide-react';
import { api, ApiError } from '../services/api';
import {
  formatCurrency,
  getClaimProgress,
  validateClaimNoteInput,
  type ClaimNoteRecord,
  type ClaimRecord,
  type ClaimStatus,
  type UserRole,
} from '../utils/insuranceRules';
import { StatusIndicator } from './StatusIndicator';

interface ClaimInspectorModalProps {
  claim: ClaimRecord;
  role: UserRole;
  onClose: () => void;
  onAdminUpdateStatus?: (claim: ClaimRecord) => void;
}

const NOTE_TAGS = ['Verification', 'Billing', 'Documents', 'Follow-up'];

export function ClaimInspectorModal({
  claim,
  role,
  onClose,
  onAdminUpdateStatus,
}: ClaimInspectorModalProps) {
  const [mainTab, setMainTab] = useState<'info' | 'breakdown'>('info');
  const [sideTab, setSideTab] = useState<'status' | 'notes'>('status');
  const [notes, setNotes] = useState<ClaimNoteRecord[]>([]);
  const [loadingNotes, setLoadingNotes] = useState(true);

  const [addingNote, setAddingNote] = useState(false);
  const [noteTitle, setNoteTitle] = useState('');
  const [noteBody, setNoteBody] = useState('');
  const [noteTags, setNoteTags] = useState<string[]>(['Documents']);
  const [noteError, setNoteError] = useState('');
  const [savingNote, setSavingNote] = useState(false);

  useEffect(() => {
    let active = true;
    setLoadingNotes(true);
    api
      .getClaimNotes(claim.claim_id)
      .then((res) => {
        if (active) setNotes(res.notes);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoadingNotes(false);
      });
    return () => {
      active = false;
    };
  }, [claim.claim_id]);

  function toggleTag(tag: string) {
    setNoteTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  }

  async function handleAddNote(e: FormEvent) {
    e.preventDefault();
    setNoteError('');
    const check = validateClaimNoteInput({ title: noteTitle, body: noteBody });
    if (!check.valid) {
      setNoteError(Object.values(check.errors)[0]);
      return;
    }

    setSavingNote(true);
    try {
      const res = await api.addClaimNote(claim.claim_id, {
        title: noteTitle.trim(),
        body: noteBody.trim(),
        tags: noteTags,
      });
      setNotes((prev) => [res.note, ...prev]);
      setNoteTitle('');
      setNoteBody('');
      setNoteTags(['Documents']);
      setAddingNote(false);
      setSideTab('notes');
    } catch (err) {
      setNoteError(err instanceof ApiError ? err.message : 'Unable to save note.');
    } finally {
      setSavingNote(false);
    }
  }

  const progress = getClaimProgress(claim.status);
  const stages: Array<{
    title: string;
    subtitle: string;
    date: string;
    state: 'done' | 'active' | 'pending' | 'rejected';
  }> = [
    {
      title: 'Claim Received',
      subtitle: 'Digital claim intake logged with hospital details.',
      date: claim.claim_date,
      state: 'done',
    },
    {
      title: 'Initial Review',
      subtitle: 'Policy eligibility and coverage limit verification.',
      date: claim.claim_date,
      state:
        claim.status === 'Pending'
          ? 'active'
          : 'done',
    },
    {
      title: 'Evidence Gathering',
      subtitle: 'Hospital invoices and procedure schedule audit.',
      date: claim.status === 'Under Review' || claim.status === 'Approved' || claim.status === 'Rejected' ? claim.claim_date : 'Queued',
      state:
        claim.status === 'Pending'
          ? 'pending'
          : claim.status === 'Under Review'
          ? 'active'
          : 'done',
    },
    {
      title: claim.status === 'Rejected' ? 'Decision: Rejected' : 'Decision & Settlement',
      subtitle:
        claim.status === 'Approved'
          ? 'Cleared for reimbursement payout.'
          : claim.status === 'Rejected'
          ? 'Claim declined after underwriter audit.'
          : 'Final verdict and disbursement notification.',
      date:
        claim.status === 'Approved' || claim.status === 'Rejected'
          ? claim.claim_date
          : 'Pending',
      state:
        claim.status === 'Approved'
          ? 'done'
          : claim.status === 'Rejected'
          ? 'rejected'
          : 'pending',
    },
  ];

  const facilityShare = Math.round(claim.claim_amount * 0.65);
  const diagnosticsShare = claim.claim_amount - facilityShare;

  const isAttentionNeeded = claim.status === 'Pending' || claim.status === 'Under Review';

  return (
    <div
      className="fixed inset-0 z-50 bg-[#0B1536]/55 backdrop-blur-[2px] flex items-center justify-center p-3 sm:p-6 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="claim-inspector-title"
    >
      <div className="bg-[#F4F7FB] border border-[#CBD5E1] rounded-2xl max-w-5xl w-full shadow-2xl overflow-hidden my-auto">
        {/* Top Case Header Bar */}
        <div className="bg-white border-b border-[#E2E8F0] px-5 sm:px-6 py-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3 min-w-0">
            <span className="text-xs font-medium text-[#64748B]">Claims</span>
            <span className="text-xs text-[#94A3B8]" aria-hidden="true">
              /
            </span>
            <h2
              id="claim-inspector-title"
              className="font-mono text-base sm:text-lg font-bold text-[#0E1A40] tabular-nums"
            >
              CLM-{claim.claim_id}
            </h2>
            <StatusIndicator status={claim.status} />
          </div>

          <div className="flex items-center gap-2.5">
            {isAttentionNeeded && (
              <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#FEF3C7] border border-[#FDE68A] text-xs font-medium text-[#92400E]">
                <AlertCircle className="w-3.5 h-3.5 text-[#D97706]" aria-hidden="true" />
                <span>Review in progress ({progress.percent}%)</span>
              </div>
            )}
            {role === 'admin' && onAdminUpdateStatus && (
              <button
                type="button"
                onClick={() => onAdminUpdateStatus(claim)}
                className="px-3.5 py-2 bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-semibold rounded-lg transition-colors whitespace-nowrap"
              >
                Update Verdict
              </button>
            )}
            <button
              type="button"
              aria-label="Close claim inspector"
              onClick={onClose}
              className="p-2 text-[#64748B] hover:text-[#0E1A40] hover:bg-[#F1F5F9] rounded-lg transition-colors"
            >
              <X className="w-5 h-5" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Summary Metadata Strip */}
        <div className="bg-white border-b border-[#E2E8F0] px-5 sm:px-6 py-3.5 grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
          <div>
            <p className="text-[#64748B]">Policy Plan</p>
            <p className="mt-0.5 font-semibold text-[#0E1A40] truncate">
              {claim.policy_name || 'Health Coverage'}
            </p>
          </div>
          <div>
            <p className="text-[#64748B]">Member / Patient</p>
            <p className="mt-0.5 font-semibold text-[#0E1A40] truncate">
              {claim.customer_name || 'Insured Member'}
            </p>
          </div>
          <div>
            <p className="text-[#64748B]">Claimed Amount</p>
            <p className="mt-0.5 font-mono font-bold text-[#2563EB] tabular-nums">
              {formatCurrency(claim.claim_amount)}
            </p>
          </div>
          <div>
            <p className="text-[#64748B]">Completion Progress</p>
            <div className="mt-1.5 flex items-center gap-2">
              <div className="flex-1 h-2 bg-[#E2E8F0] rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${progress.barClass}`}
                  style={{ width: `${progress.percent}%` }}
                />
              </div>
              <span className="font-mono font-semibold text-[#0E1A40] tabular-nums">
                {progress.percent}%
              </span>
            </div>
          </div>
        </div>

        {/* Split Body: Left Claim Details + Right Status & Notes Inspector */}
        <div className="grid grid-cols-1 lg:grid-cols-12 max-h-[72vh] overflow-y-auto">
          {/* Left 7 cols */}
          <div className="lg:col-span-7 p-5 sm:p-6 space-y-5">
            <div className="flex items-center gap-1 p-1 bg-[#E2E8F0]/70 rounded-lg w-fit">
              <button
                type="button"
                onClick={() => setMainTab('info')}
                className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                  mainTab === 'info'
                    ? 'bg-[#2563EB] text-white shadow-xs'
                    : 'text-[#475569] hover:text-[#0E1A40]'
                }`}
              >
                Claim Info
              </button>
              <button
                type="button"
                onClick={() => setMainTab('breakdown')}
                className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                  mainTab === 'breakdown'
                    ? 'bg-[#2563EB] text-white shadow-xs'
                    : 'text-[#475569] hover:text-[#0E1A40]'
                }`}
              >
                Billing &amp; Policy
              </button>
            </div>

            {mainTab === 'info' ? (
              <div className="space-y-5">
                <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 space-y-4">
                  <h3 className="font-display text-sm font-bold text-[#0E1A40]">Overview</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                    <div>
                      <p className="text-[#64748B]">Provider / Hospital</p>
                      <p className="mt-1 font-semibold text-[#0F172A]">{claim.hospital_name}</p>
                    </div>
                    <div>
                      <p className="text-[#64748B]">Network Tier</p>
                      <p className="mt-1 font-semibold text-[#059669]">Cashless Network</p>
                    </div>
                    <div>
                      <p className="text-[#64748B]">Treatment Date</p>
                      <p className="mt-1 font-mono font-semibold text-[#0F172A] tabular-nums">
                        {claim.incident_date}
                      </p>
                    </div>
                  </div>
                  <div className="pt-3 border-t border-[#F1F5F9]">
                    <p className="text-xs text-[#64748B]">Clinical Reason / Treatment Summary</p>
                    <p className="mt-1 text-sm text-[#1E293B] leading-relaxed">
                      {claim.claim_details}
                    </p>
                  </div>
                </div>

                <div className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
                  <div className="px-5 py-3.5 border-b border-[#E2E8F0] flex items-center justify-between">
                    <h3 className="font-display text-sm font-bold text-[#0E1A40]">
                      Itemized Reimbursement Breakdown
                    </h3>
                    <span className="font-mono text-xs text-[#64748B] tabular-nums">
                      Filed {claim.claim_date}
                    </span>
                  </div>
                  <table className="w-full text-left border-collapse text-xs sm:text-sm">
                    <thead>
                      <tr className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-xs font-semibold text-[#475569]">
                        <th className="py-2.5 px-4">Service Category</th>
                        <th className="py-2.5 px-4 text-right">Units</th>
                        <th className="py-2.5 px-4 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#F1F5F9]">
                      <tr>
                        <td className="py-2.5 px-4 text-[#1E293B]">
                          Hospital Procedure &amp; Facility Care
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono tabular-nums text-[#64748B]">
                          1
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono tabular-nums font-medium">
                          {formatCurrency(facilityShare)}
                        </td>
                      </tr>
                      <tr>
                        <td className="py-2.5 px-4 text-[#1E293B]">
                          Diagnostics, Labs &amp; Pharmacy
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono tabular-nums text-[#64748B]">
                          1
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono tabular-nums font-medium">
                          {formatCurrency(diagnosticsShare)}
                        </td>
                      </tr>
                      <tr className="bg-[#F8FAFC] font-semibold">
                        <td className="py-2.5 px-4 text-[#0E1A40]">Total Claimed Amount</td>
                        <td className="py-2.5 px-4" />
                        <td className="py-2.5 px-4 text-right font-mono tabular-nums text-[#2563EB]">
                          {formatCurrency(claim.claim_amount)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 space-y-4">
                <div className="flex items-center gap-2.5">
                  <Shield className="w-4 h-4 text-[#2563EB]" aria-hidden="true" />
                  <h3 className="font-display text-sm font-bold text-[#0E1A40]">
                    Linked Policy &amp; Reviewer Notes
                  </h3>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div>
                    <p className="text-[#64748B]">Coverage Plan</p>
                    <p className="mt-1 text-sm font-semibold text-[#0E1A40]">
                      {claim.policy_name || 'Health Policy'}
                    </p>
                  </div>
                  <div>
                    <p className="text-[#64748B]">Annual Coverage Limit</p>
                    <p className="mt-1 text-sm font-mono font-semibold text-[#059669] tabular-nums">
                      {formatCurrency(claim.coverage_amount || 0)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[#64748B]">Member Email</p>
                    <p className="mt-1 text-sm text-[#1E293B]">{claim.customer_email || '—'}</p>
                  </div>
                  <div>
                    <p className="text-[#64748B]">Application Reference</p>
                    <p className="mt-1 text-sm font-mono text-[#1E293B] tabular-nums">
                      APP-{claim.application_id}
                    </p>
                  </div>
                </div>
                <div className="pt-3 border-t border-[#F1F5F9]">
                  <p className="text-xs text-[#64748B]">Official Underwriter / Reviewer Remark</p>
                  <p className="mt-1 text-sm text-[#1E293B]">
                    {claim.reviewer_notes || 'No reviewer remarks posted yet.'}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Right 5 cols: Status Stepper & Persisted Notes */}
          <div className="lg:col-span-5 bg-white border-t lg:border-t-0 lg:border-l border-[#E2E8F0] p-5 sm:p-6 space-y-5">
            <div className="flex items-center justify-between gap-2 border-b border-[#E2E8F0] pb-3">
              <div className="flex items-center gap-4">
                <button
                  type="button"
                  onClick={() => setSideTab('status')}
                  className={`text-xs font-semibold pb-2 -mb-3.5 border-b-2 transition-colors whitespace-nowrap ${
                    sideTab === 'status'
                      ? 'border-[#2563EB] text-[#2563EB]'
                      : 'border-transparent text-[#64748B] hover:text-[#0E1A40]'
                  }`}
                >
                  Status Timeline
                </button>
                <button
                  type="button"
                  onClick={() => setSideTab('notes')}
                  className={`text-xs font-semibold pb-2 -mb-3.5 border-b-2 transition-colors whitespace-nowrap ${
                    sideTab === 'notes'
                      ? 'border-[#2563EB] text-[#2563EB]'
                      : 'border-transparent text-[#64748B] hover:text-[#0E1A40]'
                  }`}
                >
                  Notes ({notes.length})
                </button>
              </div>

              <button
                type="button"
                onClick={() => {
                  setSideTab('notes');
                  setAddingNote((prev) => !prev);
                }}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-[#2563EB] hover:bg-[#EFF6FF] rounded-md transition-colors whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Add Note</span>
              </button>
            </div>

            {sideTab === 'status' ? (
              <ol className="space-y-4">
                {stages.map((st, idx) => (
                  <li key={st.title} className="flex items-start gap-3">
                    <div className="flex flex-col items-center">
                      <span
                        className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 ${
                          st.state === 'done'
                            ? 'bg-[#059669] text-white'
                            : st.state === 'active'
                            ? 'bg-[#2563EB] text-white ring-4 ring-[#DBEAFE]'
                            : st.state === 'rejected'
                            ? 'bg-[#E11D48] text-white'
                            : 'bg-[#E2E8F0] text-[#64748B]'
                        }`}
                      >
                        {st.state === 'done' ? (
                          <Check className="w-3.5 h-3.5" aria-hidden="true" />
                        ) : st.state === 'active' ? (
                          <Clock className="w-3.5 h-3.5" aria-hidden="true" />
                        ) : (
                          idx + 1
                        )}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1 pb-2">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-[#0E1A40]">{st.title}</p>
                        <span className="font-mono text-[11px] text-[#64748B] tabular-nums shrink-0">
                          {st.date}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-[#475569] leading-relaxed">
                        {st.subtitle}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <div className="space-y-4">
                {addingNote && (
                  <form
                    onSubmit={handleAddNote}
                    className="p-4 bg-[#F8FAFC] border border-[#CBD5E1] rounded-xl space-y-3"
                  >
                    <p className="text-xs font-bold text-[#0E1A40]">Add Case Note</p>
                    {noteError && (
                      <p role="alert" className="text-xs text-[#B91C1C]">
                        {noteError}
                      </p>
                    )}
                    <div>
                      <label htmlFor="claim-note-title" className="sr-only">
                        Note Title
                      </label>
                      <input
                        id="claim-note-title"
                        type="text"
                        value={noteTitle}
                        onChange={(e) => setNoteTitle(e.target.value)}
                        placeholder="Note title (e.g., Hospital Discharge Report)"
                        className="w-full px-3 py-2 bg-white border border-[#CBD5E1] rounded-lg text-xs focus:outline-none focus:border-[#2563EB]"
                      />
                    </div>
                    <div>
                      <label htmlFor="claim-note-body" className="sr-only">
                        Note Description
                      </label>
                      <textarea
                        id="claim-note-body"
                        rows={3}
                        value={noteBody}
                        onChange={(e) => setNoteBody(e.target.value)}
                        placeholder="Enter verification remarks, missing receipt notes, or follow-up details..."
                        className="w-full px-3 py-2 bg-white border border-[#CBD5E1] rounded-lg text-xs focus:outline-none focus:border-[#2563EB]"
                      />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {NOTE_TAGS.map((tag) => {
                        const checked = noteTags.includes(tag);
                        return (
                          <label
                            key={tag}
                            className={`inline-flex items-center gap-1.5 px-2 py-1 rounded text-[11px] font-medium cursor-pointer border ${
                              checked
                                ? 'bg-[#EFF6FF] border-[#93C5FD] text-[#1D4ED8]'
                                : 'bg-white border-[#CBD5E1] text-[#475569]'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleTag(tag)}
                              className="accent-[#2563EB]"
                            />
                            <span>{tag}</span>
                          </label>
                        );
                      })}
                    </div>
                    <div className="flex justify-end gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setAddingNote(false)}
                        className="px-3 py-1.5 text-xs font-medium text-[#475569] hover:text-[#0E1A40]"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={savingNote}
                        className="px-3.5 py-1.5 bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-60 text-white text-xs font-semibold rounded-lg"
                      >
                        {savingNote ? 'Saving...' : 'Save Note'}
                      </button>
                    </div>
                  </form>
                )}

                {loadingNotes ? (
                  <p className="text-xs text-[#64748B]">Loading claim notes...</p>
                ) : notes.length === 0 ? (
                  <div className="p-6 text-center bg-[#F8FAFC] rounded-xl border border-[#E2E8F0]">
                    <FileText
                      className="w-5 h-5 text-[#94A3B8] mx-auto mb-2"
                      aria-hidden="true"
                    />
                    <p className="text-xs text-[#64748B]">No case notes added yet.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {notes.map((n) => (
                      <article
                        key={n.note_id}
                        className="p-3.5 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl space-y-1.5"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <h4 className="text-xs font-bold text-[#0E1A40]">{n.title}</h4>
                          <span className="font-mono text-[11px] text-[#64748B] tabular-nums">
                            {String(n.created_at ?? '').slice(0, 10) || '—'}
                          </span>
                        </div>
                        <p className="text-xs text-[#334155] leading-relaxed">{n.body}</p>
                        <div className="pt-1 flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#64748B]">
                          <span>
                            {n.author_name} ({n.author_role})
                          </span>
                          {n.tags && (
                            <span className="font-medium text-[#2563EB]">
                              {n.tags.split(',').join(' · ')}
                            </span>
                          )}
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
