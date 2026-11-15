import { useState, type FormEvent } from 'react';
import { ArrowLeft, Eye, EyeOff, Lock, Mail, Phone, User } from 'lucide-react';
import { api, ApiError, type UserProfile } from '../services/api';
import { validateRegistrationInput } from '../utils/insuranceRules';

interface AuthScreenProps {
  initialMode?: 'login' | 'register';
  pendingPolicyName?: string;
  onSuccess: (user: UserProfile) => void;
  onBackHome: () => void;
}

export function AuthScreen({
  initialMode = 'login',
  pendingPolicyName,
  onSuccess,
  onBackHome,
}: AuthScreenProps) {
  const [mode, setMode] = useState<'login' | 'register'>(initialMode);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErrorMsg('');
    setFieldErrors({});

    if (mode === 'register') {
      const check = validateRegistrationInput({
        full_name: fullName,
        email,
        phone,
        password,
      });
      if (!check.valid) {
        setFieldErrors(check.errors);
        setErrorMsg(Object.values(check.errors)[0]);
        return;
      }
    } else if (!email.trim() || !password) {
      setErrorMsg('Please enter both email and password.');
      return;
    }

    setSubmitting(true);
    try {
      const res =
        mode === 'login'
          ? await api.login({ email: email.trim(), password })
          : await api.register({
              full_name: fullName.trim(),
              email: email.trim(),
              phone: phone.trim(),
              password,
            });
      onSuccess(res.user);
    } catch (err) {
      if (err instanceof ApiError) {
        setErrorMsg(err.message);
        if (err.errors) setFieldErrors(err.errors);
      } else {
        setErrorMsg('Unable to connect to server. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  function fillDemo(role: 'customer' | 'admin') {
    setMode('login');
    setErrorMsg('');
    setFieldErrors({});
    if (role === 'customer') {
      setEmail('aarav@insurecare.com');
      setPassword('Customer@123');
    } else {
      setEmail('admin@insurecare.com');
      setPassword('Admin@123');
    }
  }

  return (
    <div className="min-h-screen bg-[#e7eddf] flex flex-col justify-center py-8 px-4 sm:px-6">
      <div className="mx-auto w-full max-w-xl rounded-[30px] border border-[#d9ded0] bg-[#fbfaf6] p-6 shadow-[0_24px_70px_rgba(24,52,43,0.12)] sm:p-10">
        <div>
          <button
            type="button"
            onClick={onBackHome}
            className="inline-flex items-center gap-2 text-sm font-medium text-[#66766b] transition-colors hover:text-[#55713d] whitespace-nowrap"
          >
            <ArrowLeft className="w-4 h-4" aria-hidden="true" />
            <span>Back to PoliPolicy Home</span>
          </button>

          <div className="mt-10">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#75934e]">
              PoliPolicy Portal
            </p>
            <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-[#18342b] sm:text-4xl">
              {mode === 'login' ? 'Sign in to your account' : 'Create your member account'}
            </h1>
            <p className="mt-2 text-[15px] text-[#66766b]">
              {pendingPolicyName
                ? `Sign in or register to continue applying for ${pendingPolicyName}.`
                : 'Manage health policies, track applications, and inspect medical claims.'}
            </p>
          </div>

          <div
            className="mt-8 inline-flex rounded-full border border-[#d9ded0] bg-[#e9e9df] p-1"
            role="tablist"
            aria-label="Authentication mode"
          >
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'login'}
              onClick={() => {
                setMode('login');
                setErrorMsg('');
                setFieldErrors({});
              }}
              className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors whitespace-nowrap ${
                mode === 'login'
                  ? 'bg-[#18342b] text-white shadow-sm'
                  : 'text-[#66766b] hover:text-[#18342b]'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'register'}
              onClick={() => {
                setMode('register');
                setErrorMsg('');
                setFieldErrors({});
              }}
              className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors whitespace-nowrap ${
                mode === 'register'
                  ? 'bg-[#18342b] text-white shadow-sm'
                  : 'text-[#66766b] hover:text-[#18342b]'
              }`}
            >
              Create Account
            </button>
          </div>

          {errorMsg && (
            <div
              role="alert"
              className="mt-6 p-3.5 rounded-lg bg-[#FFF1F2] border border-[#FECDD3] text-sm text-[#BE123C]"
            >
              {errorMsg}
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate className="mt-6 space-y-4">
            {mode === 'register' && (
              <div>
                <label
                  htmlFor="auth-fullname"
                  className="block text-sm font-medium text-[#1E293B] mb-1.5"
                >
                  Full Name
                </label>
                <div className="relative">
                  <User
                    className="w-4 h-4 text-[#64748B] absolute left-3.5 top-1/2 -translate-y-1/2"
                    aria-hidden="true"
                  />
                  <input
                    id="auth-fullname"
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Meera Nair"
                    className="w-full pl-10 pr-4 py-2.5 bg-white border border-[#CBD5E1] rounded-lg text-sm text-[#0F172A] focus:outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/15"
                  />
                </div>
                {fieldErrors.full_name && (
                  <p className="mt-1 text-xs text-[#BE123C]">{fieldErrors.full_name}</p>
                )}
              </div>
            )}

            <div>
              <label
                htmlFor="auth-email"
                className="block text-sm font-medium text-[#1E293B] mb-1.5"
              >
                Email Address
              </label>
              <div className="relative">
                <Mail
                  className="w-4 h-4 text-[#64748B] absolute left-3.5 top-1/2 -translate-y-1/2"
                  aria-hidden="true"
                />
                <input
                  id="auth-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  className="w-full pl-10 pr-4 py-2.5 bg-white border border-[#CBD5E1] rounded-lg text-sm text-[#0F172A] focus:outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/15"
                />
              </div>
              {fieldErrors.email && (
                <p className="mt-1 text-xs text-[#BE123C]">{fieldErrors.email}</p>
              )}
            </div>

            {mode === 'register' && (
              <div>
                <label
                  htmlFor="auth-phone"
                  className="block text-sm font-medium text-[#1E293B] mb-1.5"
                >
                  Phone Number
                </label>
                <div className="relative">
                  <Phone
                    className="w-4 h-4 text-[#64748B] absolute left-3.5 top-1/2 -translate-y-1/2"
                    aria-hidden="true"
                  />
                  <input
                    id="auth-phone"
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+1 415 555 0192"
                    className="w-full pl-10 pr-4 py-2.5 bg-white border border-[#CBD5E1] rounded-lg text-sm text-[#0F172A] focus:outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/15"
                  />
                </div>
                {fieldErrors.phone && (
                  <p className="mt-1 text-xs text-[#BE123C]">{fieldErrors.phone}</p>
                )}
              </div>
            )}

            <div>
              <label
                htmlFor="auth-password"
                className="block text-sm font-medium text-[#1E293B] mb-1.5"
              >
                Password
              </label>
              <div className="relative">
                <Lock
                  className="w-4 h-4 text-[#64748B] absolute left-3.5 top-1/2 -translate-y-1/2"
                  aria-hidden="true"
                />
                <input
                  id="auth-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={mode === 'register' ? 'Minimum 6 characters' : 'Enter password'}
                  className="w-full pl-10 pr-11 py-2.5 bg-white border border-[#CBD5E1] rounded-lg text-sm text-[#0F172A] focus:outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/15"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#64748B] hover:text-[#0E1A40] p-1"
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" aria-hidden="true" />
                  ) : (
                    <Eye className="w-4 h-4" aria-hidden="true" />
                  )}
                </button>
              </div>
              {fieldErrors.password && (
                <p className="mt-1 text-xs text-[#BE123C]">{fieldErrors.password}</p>
              )}
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-full bg-[#18342b] px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#294d3f] disabled:opacity-60 whitespace-nowrap"
            >
              {submitting
                ? mode === 'login'
                  ? 'Signing in...'
                  : 'Creating account...'
                : mode === 'login'
                ? 'Sign In to Portal'
                : 'Register & Continue'}
            </button>
          </form>

          {import.meta.env.DEV && (
            <div className="mt-8 border-t border-[#E2E8F0] pt-6">
              <p className="mb-3 text-xs font-medium text-[#64748B]">
                Demo Credentials for Quick Evaluation
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => fillDemo('customer')}
                  className="rounded-xl border border-[#CBD5E1] bg-white p-3.5 text-left transition-colors hover:border-[#2563EB]"
                >
                  <span className="block text-xs font-bold text-[#2563EB]">
                    Fill Customer Demo
                  </span>
                  <span className="mt-0.5 block font-mono text-xs text-[#475569]">
                    aarav@insurecare.com
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => fillDemo('admin')}
                  className="rounded-xl border border-[#CBD5E1] bg-white p-3.5 text-left transition-colors hover:border-[#059669]"
                >
                  <span className="block text-xs font-bold text-[#059669]">
                    Fill Admin Demo
                  </span>
                  <span className="mt-0.5 block font-mono text-xs text-[#475569]">
                    admin@insurecare.com
                  </span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
