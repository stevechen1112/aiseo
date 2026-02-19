'use client';

import { motion } from 'framer-motion';

import { AgentBot } from './AgentBot';
import type { AgentId, AgentStatus } from '@/lib/agent-field-utils';

type AgentBotAnimatedProps = {
  agentId: AgentId;
  status: AgentStatus;
  selected?: boolean;
  onClick?: () => void;
};

export function AgentBotAnimated({ agentId, status, selected = false, onClick }: AgentBotAnimatedProps) {
  const animation =
    status === 'running'
      ? {
          y: [0, -3, 0],
          x: [0, 4, 0],
          rotate: [0, 2, 0],
          transition: { duration: 0.7, repeat: Infinity, ease: 'easeInOut' as const },
        }
      : status === 'failed'
        ? {
            rotate: [0, 90],
            opacity: [1, 0.65],
            transition: { duration: 0.6, ease: 'easeOut' as const },
          }
        : status === 'completed'
          ? {
              scale: [1, 1.08, 1],
              transition: { duration: 0.8, repeat: Infinity, ease: 'easeInOut' as const },
            }
          : {
              y: [0, -1.5, 0],
              transition: { duration: 1.4, repeat: Infinity, ease: 'easeInOut' as const },
            };

  return (
    <motion.div animate={animation}>
      <AgentBot agentId={agentId} status={status} selected={selected} onClick={onClick} />
    </motion.div>
  );
}
