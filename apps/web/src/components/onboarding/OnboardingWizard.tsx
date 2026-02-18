'use client';

/**
 * BIZ-03: First Value Journey — 4-step onboarding wizard.
 *
 * Steps:
 *   1. Create your first project (domain + name)
 *   2. Add seed keywords
 *   3. Launch Keyword Research agent
 *   4. View your first report
 *
 * Completion state is persisted server-side via PATCH /api/auth/me
 * (UX-03) and cached in localStorage.
 */

import { useState } from 'react';
import { CheckCircle2, ChevronRight, Globe, Loader2, Search, Sparkles, BarChart2, X } from 'lucide-react';

export type OnboardingStep = 1 | 2 | 3 | 4;

interface Props {
  token?: string;
  onDismiss: () => void;
  /** Called after the user completes all 4 steps. */
  onComplete?: () => void;
}

const STEPS: { id: OnboardingStep; icon: React.ReactNode; title: string; description: string }[] = [
  {
    id: 1,
    icon: <Globe className="h-5 w-5" />,
    title: 'Create your first project',
    description: 'Add your domain and give it a name to start tracking.',
  },
  {
    id: 2,
    icon: <Search className="h-5 w-5" />,
    title: 'Add seed keywords',
    description: 'Enter 1-5 keywords you want to rank for.',
  },
  {
    id: 3,
    icon: <Sparkles className="h-5 w-5" />,
    title: 'Launch keyword research',
    description: 'Run the AI Keyword Researcher agent to discover opportunities.',
  },
  {
    id: 4,
    icon: <BarChart2 className="h-5 w-5" />,
    title: 'View your first report',
    description: 'See keyword rankings, gaps, and content ideas.',
  },
];

export function OnboardingWizard({ token, onDismiss, onComplete }: Props) {
  const [step, setStep] = useState<OnboardingStep>(1);
  const [completing, setCompleting] = useState(false);

  // --- Step 1 state ---
  const [projectName, setProjectName] = useState('');
  const [projectDomain, setProjectDomain] = useState('');
  const [step1Loading, setStep1Loading] = useState(false);
  const [step1Error, setStep1Error] = useState('');

  // --- Step 2 state ---
  const [keywordsInput, setKeywordsInput] = useState('');
  const [step2Loading, setStep2Loading] = useState(false);
  const [step2Error, setStep2Error] = useState('');

  // --- Step 3 state ---
  const [step3Loading, setStep3Loading] = useState(false);
  const [step3Error, setStep3Error] = useState('');
  const [agentTriggered, setAgentTriggered] = useState(false);

  // -------------------------------------------------------------------------
  const headers = (extra?: Record<string, string>) => ({
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extra,
  });

  const handleStep1 = async () => {
    if (!projectName.trim() || !projectDomain.trim()) {
      setStep1Error('Please fill in both fields.');
      return;
    }
    setStep1Loading(true);
    setStep1Error('');
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ name: projectName.trim(), domain: projectDomain.trim() }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setStep1Error((err as any).message ?? `Error ${res.status}`);
        return;
      }
      setStep(2);
    } catch (e) {
      setStep1Error(e instanceof Error ? e.message : 'Network error');
    } finally {
      setStep1Loading(false);
    }
  };

  const handleStep2 = async () => {
    const keywords = keywordsInput
      .split(/[\n,]+/)
      .map((k) => k.trim())
      .filter(Boolean)
      .slice(0, 10);
    if (keywords.length === 0) {
      setStep2Error('Please enter at least one keyword.');
      return;
    }
    setStep2Loading(true);
    setStep2Error('');
    try {
      // Bulk add keywords to the default project
      const res = await fetch('/api/keywords/bulk', {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ keywords }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setStep2Error((err as any).message ?? `Error ${res.status}`);
        return;
      }
      setStep(3);
    } catch (e) {
      setStep2Error(e instanceof Error ? e.message : 'Network error');
    } finally {
      setStep2Loading(false);
    }
  };

  const handleStep3 = async () => {
    setStep3Loading(true);
    setStep3Error('');
    try {
      const seedKeyword = keywordsInput.split(/[\n,]+/)[0]?.trim() ?? '';
      const res = await fetch('/api/agents/trigger', {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ agentId: 'keyword-researcher', input: { seedKeyword } }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setStep3Error((err as any).message ?? `Error ${res.status}`);
        return;
      }
      setAgentTriggered(true);
      setStep(4);
    } catch (e) {
      setStep3Error(e instanceof Error ? e.message : 'Network error');
    } finally {
      setStep3Loading(false);
    }
  };

  const handleComplete = async () => {
    setCompleting(true);
    const now = new Date().toISOString();
    try {
      // Persist completion server-side (UX-03 PATCH /api/auth/me)
      await fetch('/api/auth/me', {
        method: 'PATCH',
        headers: headers(),
        body: JSON.stringify({ settings: { onboardingSeenAt: now, onboardingCompletedAt: now } }),
      }).catch(() => {/* best-effort */});
      try { localStorage.setItem('aiseo_onboarding_seen_v1', now); } catch {/* ignore */}
      onComplete?.();
      onDismiss();
    } finally {
      setCompleting(false);
    }
  };

  // -------------------------------------------------------------------------
  return (
    <div className="rounded-xl border border-indigo-200 dark:border-indigo-800 bg-white dark:bg-gray-900 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 bg-indigo-600 px-6 py-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-indigo-200">Getting started</p>
          <h2 className="mt-0.5 text-base font-bold text-white">Your first SEO workflow — 4 steps</h2>
        </div>
        <button
          type="button"
          aria-label="Dismiss onboarding"
          onClick={onDismiss}
          className="rounded-lg p-1.5 text-indigo-200 hover:bg-indigo-700"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Step progress */}
      <div className="flex border-b border-gray-100 dark:border-gray-800">
        {STEPS.map((s, i) => (
          <button
            key={s.id}
            type="button"
            disabled={s.id > step}
            onClick={() => s.id < step && setStep(s.id)}
            className={[
              'flex flex-1 items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-semibold transition-colors',
              s.id === step
                ? 'border-b-2 border-indigo-600 text-indigo-600 dark:text-indigo-400'
                : s.id < step
                  ? 'text-green-600 dark:text-green-400 cursor-pointer'
                  : 'text-gray-400 cursor-not-allowed',
            ].join(' ')}
          >
            {s.id < step ? (
              <CheckCircle2 className="h-3.5 w-3.5" />
            ) : (
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-current/10 text-[10px] leading-none">
                {s.id}
              </span>
            )}
            <span className="hidden sm:inline">{s.title}</span>
          </button>
        ))}
      </div>

      {/* Step bodies */}
      <div className="p-6 space-y-4">
        {/* STEP 1: Create project */}
        {step === 1 && (
          <>
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-900 text-indigo-600 dark:text-indigo-300">
                <Globe className="h-4 w-4" />
              </div>
              <div>
                <p className="font-semibold text-gray-900 dark:text-white">Create your first project</p>
                <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">Add your domain and a project name to start tracking rankings.</p>
              </div>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Project name</label>
                <input
                  type="text"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  placeholder="My website"
                  className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Domain</label>
                <input
                  type="text"
                  value={projectDomain}
                  onChange={(e) => setProjectDomain(e.target.value)}
                  placeholder="example.com"
                  className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              {step1Error && <p className="text-xs text-red-500">{step1Error}</p>}
              <button
                type="button"
                disabled={step1Loading}
                onClick={() => void handleStep1()}
                className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {step1Loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronRight className="h-4 w-4" />}
                {step1Loading ? 'Creating…' : 'Create project & continue'}
              </button>
            </div>
          </>
        )}

        {/* STEP 2: Keywords */}
        {step === 2 && (
          <>
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-900 text-indigo-600 dark:text-indigo-300">
                <Search className="h-4 w-4" />
              </div>
              <div>
                <p className="font-semibold text-gray-900 dark:text-white">Add seed keywords</p>
                <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">Enter up to 10 keywords you want to rank for (one per line or comma-separated).</p>
              </div>
            </div>
            <div className="space-y-3">
              <textarea
                value={keywordsInput}
                onChange={(e) => setKeywordsInput(e.target.value)}
                rows={4}
                placeholder="seo tools&#10;keyword research&#10;content optimizer"
                className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
              />
              {step2Error && <p className="text-xs text-red-500">{step2Error}</p>}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2 text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  Back
                </button>
                <button
                  type="button"
                  disabled={step2Loading}
                  onClick={() => void handleStep2()}
                  className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  {step2Loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronRight className="h-4 w-4" />}
                  {step2Loading ? 'Saving…' : 'Save keywords & continue'}
                </button>
              </div>
            </div>
          </>
        )}

        {/* STEP 3: Trigger agent */}
        {step === 3 && (
          <>
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-900 text-indigo-600 dark:text-indigo-300">
                <Sparkles className="h-4 w-4" />
              </div>
              <div>
                <p className="font-semibold text-gray-900 dark:text-white">Launch keyword research</p>
                <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
                  The AI Keyword Researcher agent will analyse your seed keywords and uncover ranking opportunities.
                </p>
              </div>
            </div>
            {step3Error && <p className="text-xs text-red-500">{step3Error}</p>}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2 text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                Back
              </button>
              <button
                type="button"
                disabled={step3Loading}
                onClick={() => void handleStep3()}
                className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {step3Loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {step3Loading ? 'Launching…' : 'Launch agent'}
              </button>
            </div>
          </>
        )}

        {/* STEP 4: View report */}
        {step === 4 && (
          <>
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-green-100 dark:bg-green-900 text-green-600 dark:text-green-300">
                <CheckCircle2 className="h-4 w-4" />
              </div>
              <div>
                <p className="font-semibold text-gray-900 dark:text-white">
                  {agentTriggered ? 'Agent launched! Your first insight is on its way.' : 'Almost there!'}
                </p>
                <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
                  Head to the <strong>Keywords</strong> page to see results as they arrive, or open <strong>Reports</strong> to view a full summary.
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <a
                href="/dashboard/keywords"
                className="inline-flex items-center gap-2 rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2 text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                <Search className="h-4 w-4" />
                View keywords
              </a>
              <button
                type="button"
                disabled={completing}
                onClick={() => void handleComplete()}
                className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50"
              >
                {completing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                {completing ? 'Saving…' : 'Done — finish setup'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
