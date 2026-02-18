import Link from 'next/link';
import { ArrowRight, BarChart3, FileText, Search, Zap } from 'lucide-react';

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white dark:from-gray-900 dark:to-gray-800">
      {/* Hero Section */}
      <div className="container mx-auto px-4 py-16">
        <div className="text-center">
          <h1 className="text-5xl font-bold tracking-tight text-gray-900 dark:text-white sm:text-6xl">
            Enterprise SEO Automation
            <span className="block text-blue-600 dark:text-blue-400">Powered by AI</span>
          </h1>
          <p className="mt-6 text-lg leading-8 text-gray-600 dark:text-gray-300 max-w-2xl mx-auto">
            Complete SEO platform with 12 AI agents for keyword research, content generation, 
            technical audits, and continuous monitoring.
          </p>
          <div className="mt-10 flex items-center justify-center gap-x-6">
            <Link
              href="/dashboard"
              className="rounded-md bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 flex items-center gap-2"
            >
              Go to Dashboard
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/docs"
              className="text-sm font-semibold leading-6 text-gray-900 dark:text-white hover:text-blue-600"
            >
              Documentation <span aria-hidden="true">→</span>
            </Link>
          </div>
        </div>

        {/* Features Grid */}
        <div className="mt-24 grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
          <FeatureCard
            icon={<Search className="h-8 w-8" />}
            title="Keyword Research"
            description="AI-powered keyword discovery with Ahrefs & Google NLP integration"
          />
          <FeatureCard
            icon={<FileText className="h-8 w-8" />}
            title="Content Generation"
            description="Automated SEO-optimized content with human-in-the-loop review"
          />
          <FeatureCard
            icon={<BarChart3 className="h-8 w-8" />}
            title="Rank  Tracking"
            description="Daily SERP monitoring with anomaly detection and alerts"
          />
          <FeatureCard
            icon={<Zap className="h-8 w-8" />}
            title="Technical SEO"
            description="Lighthouse audits, PageSpeed monitoring, and schema validation"
          />
        </div>

        {/* Stats Section */}
        <div className="mt-24 border-t border-gray-200 dark:border-gray-700 pt-16">
          <div className="grid grid-cols-1 gap-8 sm:grid-cols-3">
            <StatCard number="12" label="AI Agents" />
            <StatCard number="4" label="Workflows" />
            <StatCard number="100%" label="Phase 2 Complete" />
          </div>
        </div>
      </div>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="relative flex flex-col gap-3 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-600 text-white">
        {icon}
      </div>
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{title}</h3>
      <p className="text-sm text-gray-600 dark:text-gray-300">{description}</p>
    </div>
  );
}

function StatCard({ number, label }: { number: string; label: string }) {
  return (
    <div className="text-center">
      <div className="text-4xl font-bold text-blue-600 dark:text-blue-400">{number}</div>
      <div className="mt-2 text-sm font-medium text-gray-600 dark:text-gray-300">{label}</div>
    </div>
  );
}
