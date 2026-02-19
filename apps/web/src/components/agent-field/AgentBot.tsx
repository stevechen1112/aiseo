'use client';

import { AGENT_COLORS, AGENT_CONFIGS, type AgentId, type AgentStatus, statusToClass } from '@/lib/agent-field-utils';

type AgentBotProps = {
  agentId: AgentId;
  status: AgentStatus;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  selected?: boolean;
  onClick?: () => void;
};

const SIZE_MAP = {
  sm: 'h-10 w-10',
  md: 'h-14 w-14',
  lg: 'h-20 w-20',
};

export function AgentBot({
  agentId,
  status,
  size = 'md',
  showLabel = true,
  selected = false,
  onClick,
}: AgentBotProps) {
  const config = AGENT_CONFIGS.find((item) => item.id === agentId);
  const color = AGENT_COLORS[agentId];
  const statusClass = statusToClass(status);

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${config?.label ?? agentId} (${status})`}
      aria-pressed={selected}
      className={`group flex flex-col items-center gap-1 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${onClick ? 'cursor-pointer' : 'cursor-default'}`}
      title={`${config?.label ?? agentId} (${status})`}
    >
      <div className={`${SIZE_MAP[size]} ${statusClass} ${selected ? 'ring-2 ring-blue-500 rounded-full' : ''}`}>
        <svg viewBox="0 0 56 72" className="h-full w-full">
          <line x1="28" y1="6" x2="28" y2="1" stroke={color} strokeWidth="3" />
          <circle cx="28" cy="1" r="2.5" fill={color} />

          <rect x="14" y="8" width="28" height="20" rx="6" fill={color} />
          <circle cx="23" cy="18" r="4" fill="white" />
          <circle cx="33" cy="18" r="4" fill="white" />
          <circle cx="23" cy="18" r="1.8" fill="#111827" />
          <circle cx="33" cy="18" r="1.8" fill="#111827" />

          {config?.isSmartAgent ? (
            <path d="M20 6 Q28 0 36 6" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
          ) : (
            <circle cx="28" cy="6" r="3" fill="#e5e7eb" stroke={color} strokeWidth="2" />
          )}

          <rect x="12" y="30" width="32" height="24" rx="6" fill={color} opacity="0.95" />
          <rect x="8" y="33" width="6" height="14" rx="2" fill={color} />
          <rect x="42" y="33" width="6" height="14" rx="2" fill={color} />
          <rect x="16" y="54" width="8" height="14" rx="2" fill={color} />
          <rect x="32" y="54" width="8" height="14" rx="2" fill={color} />
        </svg>
      </div>
      {showLabel ? <span className="text-[11px] text-gray-700 dark:text-gray-300">{config?.label ?? agentId}</span> : null}
    </button>
  );
}
