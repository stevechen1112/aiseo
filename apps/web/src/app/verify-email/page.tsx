'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { verifyEmail } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';

function VerifyEmailContent() {
  const router = useRouter();
  const params = useSearchParams();
  const { isAuthenticated } = useAuth();

  const token = params.get('token') || '';

  const [status, setStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle');
  const [message, setMessage] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!token) {
        setStatus('error');
        setMessage('Missing token');
        return;
      }

      setStatus('loading');
      try {
        const res = await verifyEmail(token);
        if (cancelled) return;
        setStatus('ok');
        setMessage(res.alreadyVerified ? 'Email already verified.' : 'Email verified successfully.');
      } catch (err) {
        if (cancelled) return;
        setStatus('error');
        setMessage(err instanceof Error ? err.message : 'Verification failed.');
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const nextHref = isAuthenticated ? '/dashboard' : '/login';

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white dark:from-gray-900 dark:to-gray-800 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-8 shadow-lg">
          {status === 'loading' && (
            <div className="flex items-center gap-3 text-gray-700 dark:text-gray-200">
              <Loader2 className="h-5 w-5 animate-spin" />
              <p className="text-sm">Verifying your email...</p>
            </div>
          )}

          {status === 'ok' && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="h-6 w-6 text-green-600 dark:text-green-400" />
                <h1 className="text-lg font-semibold text-gray-900 dark:text-white">Verified</h1>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400">{message}</p>
              <button
                type="button"
                onClick={() => router.push(nextHref)}
                className="w-full rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700"
              >
                Continue
              </button>
            </div>
          )}

          {status === 'error' && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <AlertCircle className="h-6 w-6 text-red-600 dark:text-red-400" />
                <h1 className="text-lg font-semibold text-gray-900 dark:text-white">Verification failed</h1>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400">{message}</p>
              <Link
                href="/signup"
                className="block w-full text-center rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-3 text-sm font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                Back to sign up
              </Link>
            </div>
          )}

          {status === 'idle' && (
            <p className="text-sm text-gray-600 dark:text-gray-400">Waiting for token...</p>
          )}
        </div>
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white dark:from-gray-900 dark:to-gray-800 flex items-center justify-center px-4">
          <div className="w-full max-w-md">
            <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-8 shadow-lg">
              <div className="flex items-center gap-3 text-gray-700 dark:text-gray-200">
                <Loader2 className="h-5 w-5 animate-spin" />
                <p className="text-sm">Loading...</p>
              </div>
            </div>
          </div>
        </div>
      }
    >
      <VerifyEmailContent />
    </Suspense>
  );
}
