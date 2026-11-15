import type {
  ApplicationRecord,
  ApplicationStatus,
  AuditLogRecord,
  ClaimNoteRecord,
  ClaimRecord,
  ClaimStatus,
  NotificationRecord,
  PartnerHospitalRecord,
  PaymentMethod,
  PaymentRecord,
  PolicyRecord,
  UserRole,
} from '../utils/insuranceRules';

export interface UserProfile {
  user_id: number;
  full_name: string;
  email: string;
  phone: string;
  role: UserRole;
  created_at: string;
}

export interface CustomerSummaryRow {
  user_id: number;
  full_name: string;
  email: string;
  phone: string;
  created_at: string;
  application_count: number;
  active_policies: number;
}

export interface InquiryRecord {
  inquiry_id: number;
  full_name: string;
  email: string;
  phone: string;
  preferred_category: string;
  message: string;
  created_at: string;
}

export interface AdminOverviewResponse {
  stats: {
    customerCount: number;
    policyCount: number;
    pendingAppsCount: number;
    approvedAppsCount: number;
    openClaimsCount: number;
    activeCoverageVolume: number;
  };
  customers: CustomerSummaryRow[];
  inquiries: InquiryRecord[];
}

export interface AdminAnalyticsResponse {
  analytics: {
    byCategory: Array<{
      category: string;
      policyCount: number;
      applicationCount: number;
      approvedCount: number;
    }>;
    appStatusCounts: Record<'Pending' | 'Approved' | 'Rejected', number>;
    claimStatusCounts: Record<'Pending' | 'Under Review' | 'Approved' | 'Rejected', number>;
    totalCollectedPremium: number;
    totalApprovedClaimPayout: number;
    totalClaimRequested: number;
    totalPaymentsCount: number;
  };
}

export class ApiError extends Error {
  status: number;
  errors?: Record<string, string>;

  constructor(message: string, status: number, errors?: Record<string, string>) {
    super(message);
    this.status = status;
    this.errors = errors;
  }
}

const TOKEN_STORAGE_KEY = 'policypulse_auth_token';

function getStoredToken(): string | null {
  try {
    return window.localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

function setStoredToken(token: string | null) {
  try {
    if (token) {
      window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
    } else {
      window.localStorage.removeItem(TOKEN_STORAGE_KEY);
    }
  } catch {
    // Ignore storage errors in restricted contexts
  }
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const token = getStoredToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options?.headers as Record<string, string>) ?? {}),
  };
  if (token && !headers.Authorization) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(url, {
    credentials: 'include',
    ...options,
    headers,
  });

  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    throw new ApiError(
      `API endpoint returned non-JSON response (${res.status}). Ensure backend API routes are active.`,
      res.status || 500
    );
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && !url.includes('/api/auth/login') && !url.includes('/api/auth/register')) {
      setStoredToken(null);
    }
    throw new ApiError(data.error || 'Request failed', res.status, data.errors);
  }
  return data as T;
}

export const api = {
  getMe: () => request<{ user: UserProfile | null }>('/api/auth/me'),
  login: async (payload: { email: string; password: string }) => {
    const res = await request<{ user: UserProfile; token?: string }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    if (res.token) setStoredToken(res.token);
    return res;
  },
  register: async (payload: {
    full_name: string;
    email: string;
    phone: string;
    password: string;
  }) => {
    const res = await request<{ user: UserProfile; token?: string }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    if (res.token) setStoredToken(res.token);
    return res;
  },
  changePassword: (payload: { current_password: string; new_password: string }) =>
    request<{ ok: boolean; message: string }>('/api/auth/change-password', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  logout: async () => {
    try {
      return await request<{ ok: boolean }>('/api/auth/logout', { method: 'POST' });
    } finally {
      setStoredToken(null);
    }
  },

  getHospitals: (params?: { q?: string; city?: string }) => {
    const sp = new URLSearchParams();
    if (params?.city && params.city !== 'All') sp.set('city', params.city);
    if (params?.q) sp.set('q', params.q);
    const qs = sp.toString();
    return request<{ hospitals: PartnerHospitalRecord[] }>(
      `/api/hospitals${qs ? `?${qs}` : ''}`
    );
  },

  getPolicies: (params?: { category?: string; q?: string }) => {
    const sp = new URLSearchParams();
    if (params?.category && params.category !== 'All') sp.set('category', params.category);
    if (params?.q) sp.set('q', params.q);
    const qs = sp.toString();
    return request<{ policies: PolicyRecord[] }>(`/api/policies${qs ? `?${qs}` : ''}`);
  },
  createPolicy: (payload: Omit<PolicyRecord, 'policy_id' | 'created_at'>) =>
    request<{ policy: PolicyRecord }>('/api/policies', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updatePolicy: (id: number, payload: Omit<PolicyRecord, 'policy_id' | 'created_at'>) =>
    request<{ policy: PolicyRecord }>(`/api/policies/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
  deletePolicy: (id: number) =>
    request<{ ok: boolean }>(`/api/policies/${id}`, { method: 'DELETE' }),

  getApplications: (status?: string) => {
    const qs = status && status !== 'All' ? `?status=${encodeURIComponent(status)}` : '';
    return request<{ applications: ApplicationRecord[] }>(`/api/applications${qs}`);
  },
  submitApplication: (payload: {
    policy_id: number;
    applicant_age: number;
    nominee_name: string;
    medical_notes: string;
  }) =>
    request<{ application: ApplicationRecord }>('/api/applications', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateApplicationStatus: (id: number, status: ApplicationStatus, admin_notes: string) =>
    request<{ application: ApplicationRecord }>(`/api/applications/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status, admin_notes }),
    }),

  getClaims: (status?: string) => {
    const qs = status && status !== 'All' ? `?status=${encodeURIComponent(status)}` : '';
    return request<{ claims: ClaimRecord[] }>(`/api/claims${qs}`);
  },
  submitClaim: (payload: {
    application_id: number;
    claim_amount: number;
    hospital_name: string;
    incident_date: string;
    claim_details: string;
  }) =>
    request<{ claim: ClaimRecord }>('/api/claims', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateClaimStatus: (id: number, status: ClaimStatus, reviewer_notes: string) =>
    request<{ claim: ClaimRecord }>(`/api/claims/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status, reviewer_notes }),
    }),
  getClaimNotes: (claimId: number) =>
    request<{ notes: ClaimNoteRecord[] }>(`/api/claims/${claimId}/notes`),
  addClaimNote: (
    claimId: number,
    payload: { title: string; body: string; tags: string[] }
  ) =>
    request<{ note: ClaimNoteRecord }>(`/api/claims/${claimId}/notes`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getPayments: () => request<{ payments: PaymentRecord[] }>('/api/payments'),
  submitPayment: (payload: {
    application_id: number;
    amount: number;
    payment_method: PaymentMethod;
    account_identifier: string;
  }) =>
    request<{ payment: PaymentRecord }>('/api/payments', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getNotifications: () =>
    request<{ notifications: NotificationRecord[]; unreadCount: number }>('/api/notifications'),
  markNotificationRead: (id: number) =>
    request<{ ok: boolean }>(`/api/notifications/${id}/read`, { method: 'PATCH' }),
  markAllNotificationsRead: () =>
    request<{ ok: boolean }>('/api/notifications/read-all', { method: 'PATCH' }),

  getAdminOverview: () => request<AdminOverviewResponse>('/api/admin/overview'),
  getAdminAnalytics: () => request<AdminAnalyticsResponse>('/api/admin/analytics'),
  getAdminAuditLogs: (q?: string) => {
    const qs = q ? `?q=${encodeURIComponent(q)}` : '';
    return request<{ logs: AuditLogRecord[] }>(`/api/admin/audit-logs${qs}`);
  },

  submitInquiry: (payload: {
    full_name: string;
    email: string;
    phone: string;
    preferred_category: string;
    message: string;
  }) =>
    request<{ inquiry_id: number; message: string }>('/api/inquiries', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
};
