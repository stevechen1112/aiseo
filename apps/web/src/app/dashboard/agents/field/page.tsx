'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

import { AgentFieldScene } from '@/components/agent-field/AgentFieldScene';

export default function AgentFieldPage() {
  const pathname = usePathname();
  const backHref = pathname.replace(/\/field$/, '') || '/dashboard/agents';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Agent Field</h1>
          <p className="mt-1 text-gray-600 dark:text-gray-400">Interactive multi-agent orchestration scene</p>
        </div>
        <Link
          href={backHref}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
        >
          <ArrowLeft className="h-4 w-4" />
          List View
        </Link>
      </div>

      <AgentFieldScene />
    </div>
  );
}
