import { useCallback, useEffect, useState } from 'react';
import { AdminPortal } from './components/AdminPortal';
import { AuthScreen } from './components/AuthScreen';
import { CustomerPortal } from './components/CustomerPortal';
import { LandingPage } from './components/LandingPage';
import { api, type UserProfile } from './services/api';
import type { PolicyRecord } from './utils/insuranceRules';

type AppView = 'landing' | 'auth' | 'portal';

function readInitialView(): AppView {
  const path = window.location.pathname;
  if (path === '/portal') return 'portal';
  if (path === '/auth') return 'auth';
  return 'landing';
}

export default function App() {
  const [view, setView] = useState<AppView>(readInitialView);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [user, setUser] = useState<UserProfile | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  const [policies, setPolicies] = useState<PolicyRecord[]>([]);
  const [loadingPolicies, setLoadingPolicies] = useState(true);
  const [policiesError, setPoliciesError] = useState('');
  const [preselectedPolicyId, setPreselectedPolicyId] = useState<number | null>(null);

  const navigateView = useCallback((nextView: AppView) => {
    setView(nextView);
    const targetPath =
      nextView === 'portal' ? '/portal' : nextView === 'auth' ? '/auth' : '/';
    if (window.location.pathname !== targetPath) {
      window.history.pushState(null, '', targetPath);
    }
  }, []);

  useEffect(() => {
    const onPopState = () => {
      setView(readInitialView());
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const loadPolicies = useCallback(async () => {
    setLoadingPolicies(true);
    setPoliciesError('');
    try {
      const polRes = await api.getPolicies();
      setPolicies(polRes.policies ?? []);
    } catch (err) {
      setPoliciesError(
        err instanceof Error ? err.message : 'Unable to load health insurance plans.'
      );
    } finally {
      setLoadingPolicies(false);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    Promise.all([
      api
        .getPolicies()
        .then((res) => ({ ok: true as const, policies: res.policies ?? [] }))
        .catch((err) => ({
          ok: false as const,
          error: err instanceof Error ? err.message : 'Unable to load health insurance plans.',
        })),
      api.getMe().catch(() => ({ user: null })),
    ]).then(([polRes, meRes]) => {
      if (!mounted) return;
      if (polRes.ok) {
        setPolicies(polRes.policies);
        setPoliciesError('');
      } else {
        setPoliciesError(polRes.error);
      }
      setLoadingPolicies(false);
      if (meRes && meRes.user) {
        setUser(meRes.user);
      } else if (readInitialView() === 'portal') {
        navigateView('auth');
      }
      setAuthChecked(true);
    });
    return () => {
      mounted = false;
    };
  }, [navigateView]);

  const handleOpenAuth = useCallback(
    (mode: 'login' | 'register', policyId?: number) => {
      setAuthMode(mode);
      if (policyId) setPreselectedPolicyId(policyId);
      navigateView('auth');
      window.scrollTo({ top: 0 });
    },
    [navigateView]
  );

  const handleApplyPolicy = useCallback(
    (policyId: number) => {
      setPreselectedPolicyId(policyId);
      if (user) {
        navigateView('portal');
        window.scrollTo({ top: 0 });
      } else {
        setAuthMode('register');
        navigateView('auth');
        window.scrollTo({ top: 0 });
      }
    },
    [user, navigateView]
  );

  const handleAuthSuccess = useCallback(
    (loggedInUser: UserProfile) => {
      setUser(loggedInUser);
      navigateView('portal');
      window.scrollTo({ top: 0 });
    },
    [navigateView]
  );

  const handleLogout = useCallback(async () => {
    await api.logout().catch(() => {});
    setUser(null);
    setPreselectedPolicyId(null);
    navigateView('landing');
    window.scrollTo({ top: 0 });
  }, [navigateView]);

  const pendingPolicyName = preselectedPolicyId
    ? policies.find((p) => p.policy_id === preselectedPolicyId)?.policy_name
    : undefined;

  if (!authChecked && view === 'portal') {
    return (
      <div className="min-h-screen bg-[#F7F9F8] flex items-center justify-center text-sm text-[#475569]">
        Loading PolicyPulse Portal...
      </div>
    );
  }

  if (view === 'auth') {
    return (
      <AuthScreen
        initialMode={authMode}
        pendingPolicyName={pendingPolicyName}
        onSuccess={handleAuthSuccess}
        onBackHome={() => navigateView('landing')}
      />
    );
  }

  if (view === 'portal' && user) {
    if (user.role === 'admin') {
      return (
        <AdminPortal
          user={user}
          policies={policies}
          onPoliciesChanged={setPolicies}
          onGoHome={() => navigateView('landing')}
          onLogout={handleLogout}
        />
      );
    }

    return (
      <CustomerPortal
        user={user}
        policies={policies}
        initialPreselectedPolicyId={preselectedPolicyId}
        onClearPreselectedPolicy={() => setPreselectedPolicyId(null)}
        onGoHome={() => navigateView('landing')}
        onLogout={handleLogout}
      />
    );
  }

  return (
    <LandingPage
      policies={policies}
      loadingPolicies={loadingPolicies}
      policiesError={policiesError}
      onRetryPolicies={loadPolicies}
      currentUser={user}
      onOpenPortal={() => {
        if (user) {
          navigateView('portal');
          window.scrollTo({ top: 0 });
        } else {
          handleOpenAuth('login');
        }
      }}
      onOpenAuth={handleOpenAuth}
      onApplyPolicy={handleApplyPolicy}
    />
  );
}
