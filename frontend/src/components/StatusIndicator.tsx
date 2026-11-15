import { CheckCircle2, Clock, Search, XCircle } from 'lucide-react';
import type { ApplicationStatus, ClaimStatus } from '../utils/insuranceRules';

interface StatusIndicatorProps {
  status: ApplicationStatus | ClaimStatus;
}

export function StatusIndicator({ status }: StatusIndicatorProps) {
  const config: Record<
    ApplicationStatus | ClaimStatus,
    { icon: typeof CheckCircle2; colorClass: string }
  > = {
    Approved: {
      icon: CheckCircle2,
      colorClass: 'text-[#047857] bg-[#ECFDF5] border-[#A7F3D0]',
    },
    Pending: {
      icon: Clock,
      colorClass: 'text-[#B45309] bg-[#FFFBEB] border-[#FDE68A]',
    },
    'Under Review': {
      icon: Search,
      colorClass: 'text-[#1D4ED8] bg-[#EFF6FF] border-[#BFDBFE]',
    },
    Rejected: {
      icon: XCircle,
      colorClass: 'text-[#BE123C] bg-[#FFF1F2] border-[#FECDD3]',
    },
  };

  const item = config[status] ?? config.Pending;
  const Icon = item.icon;

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md border whitespace-nowrap ${item.colorClass}`}
    >
      <Icon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      <span>{status}</span>
    </span>
  );
}
