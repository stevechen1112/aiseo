'use client';

import { FormEvent, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertCircle, ArrowRight, CheckCircle2, Mail } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { resendVerification } from '@/lib/api';

type Step = 1 | 2 | 3;

export default function SignupPage() {
  const router = useRouter();
  const { register, isLoading } = useAuth();

  const [step, setStep] = useState<Step>(1);
  const [error, setError] = useState('');
  const [isResending, setIsResending] = useState(false);
  const [resentOk, setResentOk] = useState(false);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [tenantName, setTenantName] = useState('');
  const [tenantSlug, setTenantSlug] = useState('');
  const [projectDomain, setProjectDomain] = useState('');

  const slugPlaceholder = useMemo(() => {
    const local = email.split('@')[0] ?? '';
    return local.trim() ? local.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-') : 'workspace';
  }, [email]);

  const goNext = () => setStep((s) => (s === 1 ? 2 : s));
  const goBack = () => setStep((s) => (s === 2 ? 1 : s));

  const handleStep1 = (e: FormEvent) => {
    e.preventDefault();
    setError('');

    if (!name.trim() || !email.trim() || !password) {
      setError('Please fill in all required fields');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    goNext();
  };

  const handleStep2 = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      await register({
        name: name.trim(),
        email: email.trim(),
        password,
        tenantName: tenantName.trim() || undefined,
        tenantSlug: tenantSlug.trim() || undefined,
        projectDomain: projectDomain.trim() || undefined,
      });
      setStep(3);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign up failed. Please try again.');
    }
  };

  const handleResend = async () => {
    setError('');
    setResentOk(false);
    setIsResending(true);
    try {
      await resendVerification(email.trim());
      setResentOk(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resend email.');
    } finally {
      setIsResending(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white dark:from-gray-900 dark:to-gray-800 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-lg bg-blue-600 text-white font-bold text-xl mb-4">
            AI
          </div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Create your account</h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            {step === 3 ? 'Verify your email to finish setup' : `Step ${step} of 2`}
          </p>
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-8 shadow-lg">
          {error && (
            <div className="mb-6 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-4">
              <div className="flex items-center gap-3">
                <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0" />
                <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
              </div>
            </div>
          )}

          {step === 1 && (
            <form onSubmit={handleStep1} className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Name</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  placeholder="Jane Doe"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  placeholder="you@company.com"
                  required
                  autoComplete="email"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  placeholder="••••••••"
                  required
                  autoComplete="new-password"
                />
              </div>

              <button
                type="submit"
                className="w-full flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700"
              >
                Continue <ArrowRight className="h-4 w-4" />
              </button>

              <p className="text-sm text-gray-600 dark:text-gray-400 text-center">
                Already have an account?{' '}
                <Link href="/login" className="font-medium text-blue-600 hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300">
                  Sign in
                </Link>
              </p>
            </form>
          )}

          {step === 2 && (
            <form onSubmit={handleStep2} className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Workspace name (optional)</label>
                <input
                  value={tenantName}
                  onChange={(e) => setTenantName(e.target.value)}
                  className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  placeholder={`${name || 'Your'} Workspace`}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Workspace slug (optional)</label>
                <input
                  value={tenantSlug}
                  onChange={(e) => setTenantSlug(e.target.value)}
                  className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  placeholder={slugPlaceholder}
                />
                <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">Used for internal identifiers. Letters, numbers, and hyphens.</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Project domain (optional)</label>
                <input
                  value={projectDomain}
                  onChange={(e) => setProjectDomain(e.target.value)}
                  className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  placeholder="example.com"
                />
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={goBack}
                  className="flex-1 rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-3 text-sm font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  Back
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {isLoading ? 'Creating...' : 'Create account'}
                </button>
              </div>
            </form>
          )}

          {step === 3 && (
            <div className="space-y-6">
              <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4">
                <div className="flex items-start gap-3">
                  <Mail className="h-5 w-5 text-gray-500 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">Check your inbox</p>
                    <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                      We sent a verification link to <span className="font-medium">{email}</span>.
                      You can continue, but verifying helps secure your account.
                    </p>
                  </div>
                </div>
              </div>

              {resentOk && (
                <div className="rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 p-4">
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
                    <p className="text-sm text-green-700 dark:text-green-300">Verification email sent.</p>
                  </div>
                </div>
              )}

              <button
                type="button"
                onClick={handleResend}
                disabled={isResending || !email.trim()}
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-3 text-sm font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
              >
                {isResending ? 'Sending...' : 'Resend verification email'}
              </button>

              <button
                type="button"
                onClick={() => router.push('/dashboard')}
                className="w-full rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700"
              >
                Continue to dashboard
              </button>

              <p className="text-sm text-gray-600 dark:text-gray-400 text-center">
                <Link href="/login" className="font-medium text-blue-600 hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300">
                  Sign in instead
                </Link>
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
