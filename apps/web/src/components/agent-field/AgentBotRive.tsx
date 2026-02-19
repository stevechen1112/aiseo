'use client';

import { useEffect } from 'react';
import { useRive, useStateMachineInput } from '@rive-app/react-canvas';

import { AgentBotAnimated } from './AgentBotAnimated';
import { AGENT_CONFIGS, type AgentId, type AgentStatus } from '@/lib/agent-field-utils';

type AgentBotRiveProps = {
  agentId: AgentId;
  status: AgentStatus;
  selected?: boolean;
  onClick?: () => void;
  assetSrc?: string;
};

type AgentBotRiveInnerProps = {
  label: string;
  status: AgentStatus;
  selected: boolean;
  onClick?: () => void;
  assetSrc: string;
};

function AgentBotRiveInner({ label, status, selected, onClick, assetSrc }: AgentBotRiveInnerProps) {
  const { rive, RiveComponent } = useRive({
    src: assetSrc,
    stateMachines: 'AgentStateMachine',
    autoplay: true,
  });

  const runningInput = useStateMachineInput(rive, 'AgentStateMachine', 'isRunning');
  const failedInput = useStateMachineInput(rive, 'AgentStateMachine', 'isFailed');
  const completedInput = useStateMachineInput(rive, 'AgentStateMachine', 'isCompleted');

  useEffect(() => {
    if (runningInput) runningInput.value = status === 'running';
    if (failedInput) failedInput.value = status === 'failed';
    if (completedInput) completedInput.value = status === 'completed';
  }, [completedInput, failedInput, runningInput, status]);

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${label} (${status})`}
      aria-pressed={selected}
      className={`rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${selected ? 'ring-2 ring-blue-500' : ''}`}
    >
      <RiveComponent className="h-14 w-14" />
    </button>
  );
}

export function AgentBotRive({
  agentId,
  status,
  selected = false,
  onClick,
  assetSrc = process.env.NEXT_PUBLIC_RIVE_AGENT_SRC,
}: AgentBotRiveProps) {
  const label = AGENT_CONFIGS.find((agent) => agent.id === agentId)?.label ?? agentId;

  if (!assetSrc) {
    return <AgentBotAnimated agentId={agentId} status={status} selected={selected} onClick={onClick} />;
  }

  return <AgentBotRiveInner label={label} status={status} selected={selected} onClick={onClick} assetSrc={assetSrc} />;
}
