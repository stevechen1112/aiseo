'use client';

import { AGENT_CONFIGS, type AgentId } from '@/lib/agent-field-utils';

type AgentCounterHUDProps = {
  agentCounts: Record<AgentId, number>;
  totalDeployed: number;
  totalIdle: number;
  totalFailed: number;
};

export function AgentCounterHUD({ agentCounts, totalDeployed, totalIdle, totalFailed }: AgentCounterHUDProps) {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white/90 dark:bg-gray-900/80 p-3 backdrop-blur">
      <div className="grid grid-cols-3 gap-2 text-[11px] text-gray-700 dark:text-gray-300">
        {AGENT_CONFIGS.map((agent) => (
          <div key={agent.id} className="flex items-center gap-1">
            <span>{agent.icon}</span>
            <span className="truncate">{agentCounts[agent.id] ?? 0}</span>
          </div>
        ))}
      </div>
      <div className="mt-2 border-t border-gray-200 dark:border-gray-700 pt-2 text-[11px] text-gray-600 dark:text-gray-400">
        <div>出動中：{totalDeployed}</div>
        <div>基地待命：{totalIdle}</div>
        <div>今日失敗：{totalFailed}</div>
      </div>
    </div>
  );
}
