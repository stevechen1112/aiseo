'use client';

import { useEffect, useMemo, useState } from 'react';

import { useAuth } from '@/lib/auth-context';
import { useAgentActivities, useRunSchedule, useSchedules, useTenantUsage } from '@/lib/queries';
import { useWebSocket } from '@/lib/websocket';
import {
  AGENT_CONFIGS,
  TASK_BOXES,
  buildAchievementText,
  computeAgentPosition,
  deriveAgentStatus,
  getDaylightOpacity,
  getPlanScale,
  getQuotaPressurePercent,
  secondsUntilNextDayPhase,
  type AgentId,
  type AgentStatus,
} from '@/lib/agent-field-utils';
import { AgentBotAnimated } from './AgentBotAnimated';
import { AgentBotRive } from './AgentBotRive';
import { AgentCounterHUD } from './AgentCounterHUD';
import { BaseHQ } from './BaseHQ';
import { FailedZone } from './FailedZone';
import { TaskBox } from './TaskBox';
import { ThrowAnimation } from './ThrowAnimation';

type AgentFieldSceneProps = {
  width?: number;
  height?: number;
};

export function AgentFieldScene({ width = 1200, height = 620 }: AgentFieldSceneProps) {
  const { token } = useAuth();
  const { data: schedules = [] } = useSchedules();
  const { data: activities = [] } = useAgentActivities();
  const { data: usageData } = useTenantUsage(token || undefined);
  const runSchedule = useRunSchedule();

  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [liveStatus, setLiveStatus] = useState<Partial<Record<AgentId, AgentStatus>>>({});
  const [achievement, setAchievement] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(() => secondsUntilNextDayPhase());
  const [throwState, setThrowState] = useState<{ active: boolean; from: { x: number; y: number }; to: { x: number; y: number } }>({
    active: false,
    from: { x: 0, y: 0 },
    to: { x: 0, y: 0 },
  });

  useEffect(() => {
    const timer = window.setInterval(() => {
      setSecondsLeft(secondsUntilNextDayPhase());
    }, 1000);

    return () => window.clearInterval(timer);
  }, []);

  useWebSocket({
    token: token || undefined,
    enabled: !!token,
    onMessage: (message) => {
      const payload = message.data as { agentId?: string; status?: string } | null;
      const agentId = payload?.agentId;
      const status = payload?.status;

      if (!agentId || !status) return;
      if (!AGENT_CONFIGS.some((agent) => agent.id === agentId)) return;

      const typedAgentId = agentId as AgentId;
      const typedStatus = status as AgentStatus;
      setLiveStatus((prev) => ({ ...prev, [typedAgentId]: typedStatus }));

      if (typedStatus === 'completed') {
        const label = AGENT_CONFIGS.find((agent) => agent.id === typedAgentId)?.label ?? typedAgentId;
        setAchievement(buildAchievementText(label));
      }
    },
  });

  useEffect(() => {
    if (!achievement) return;
    const t = window.setTimeout(() => setAchievement(null), 3200);
    return () => window.clearTimeout(t);
  }, [achievement]);

  const scheduleById = useMemo(() => {
    const map = new Map<string, (typeof schedules)[number]>();
    schedules.forEach((schedule) => map.set(schedule.id, schedule));
    return map;
  }, [schedules]);

  const statusByAgent = useMemo(() => {
    return Object.fromEntries(
      AGENT_CONFIGS.map((agent) => [agent.id, deriveAgentStatus(agent.id, scheduleById.get(agent.id), activities, liveStatus)]),
    ) as Record<AgentId, AgentStatus>;
  }, [activities, liveStatus, scheduleById]);

  const agentCounts = useMemo(() => {
    const base = Object.fromEntries(AGENT_CONFIGS.map((agent) => [agent.id, 0])) as Record<AgentId, number>;
    activities.forEach((activity) => {
      if (activity.status === 'running' && AGENT_CONFIGS.some((agent) => agent.id === activity.agentName)) {
        base[activity.agentName as AgentId] += 1;
      }
    });
    return base;
  }, [activities]);

  const totals = useMemo(() => {
    const deployed = Object.values(statusByAgent).filter((status) => status === 'running').length;
    const idle = Object.values(statusByAgent).filter((status) => status === 'idle' || status === 'waiting').length;
    const failed = activities.filter((activity) => activity.status === 'failed').length;
    return { deployed, idle, failed };
  }, [activities, statusByAgent]);

  const quotaPressure = getQuotaPressurePercent({
    quotas: usageData?.quotas,
    usage: usageData?.usage,
  });

  const daylightOpacity = getDaylightOpacity(secondsLeft);
  const isAiming = selectedTaskId !== null;

  const taskRunningCounts = useMemo(() => {
    return Object.fromEntries(
      TASK_BOXES.map((box) => [
        box.id,
        box.agentIds.reduce((sum, agentId) => sum + (statusByAgent[agentId] === 'running' ? 1 : 0), 0),
      ]),
    ) as Record<string, number>;
  }, [statusByAgent]);

  const handleAgentClick = (agentId: AgentId) => {
    if (!selectedTaskId) return;
    if (statusByAgent[agentId] !== 'idle' && statusByAgent[agentId] !== 'waiting') return;

    const targetTask = TASK_BOXES.find((task) => task.id === selectedTaskId);
    if (!targetTask) return;
    if (!targetTask.agentIds.includes(agentId)) return;

    const selectedAgent = agentId;
    runSchedule.mutate(selectedAgent);

    setThrowState({
      active: true,
      from: { x: width * 0.2, y: height * 0.48 },
      to: { x: (targetTask.xPct / 100) * width, y: (targetTask.yPct / 100) * height },
    });

    setLiveStatus((prev) => ({ ...prev, [agentId]: 'running' }));
    setSelectedTaskId(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">AISEO Agent Field</h2>
        <div className="text-sm text-gray-600 dark:text-gray-400">日落倒數：{secondsLeft}s</div>
      </div>

      {quotaPressure >= 80 ? (
        <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/70 dark:bg-red-950/20 dark:text-red-300">
          配額警示：目前資源壓力 {quotaPressure}%
        </div>
      ) : null}

      {achievement ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/20 dark:text-emerald-300">
          🎉 {achievement}
        </div>
      ) : null}

      <div
        className={`relative overflow-hidden rounded-2xl border border-gray-200 bg-gradient-to-b from-lime-100 to-emerald-200 p-4 dark:border-gray-700 dark:from-emerald-950 dark:to-slate-900 ${
          isAiming ? 'cursor-crosshair' : ''
        } ${quotaPressure >= 95 ? 'animate-pulse' : ''}`}
      >
        <div className="absolute inset-0 bg-slate-900 transition-opacity duration-500" style={{ opacity: daylightOpacity }} />

        <svg viewBox={`0 0 ${width} ${height}`} className="relative z-10 w-full">
          <circle cx={120} cy={120} r={48} fill="#86efac" opacity={0.6} />
          <ellipse cx={1020} cy={160} rx={54} ry={30} fill="#4ade80" opacity={0.4} />
          <ellipse cx={960} cy={500} rx={70} ry={36} fill="#65a30d" opacity={0.4} />
          <circle cx={180} cy={500} r={30} fill="#84cc16" opacity={0.5} />

          <g transform={`translate(${width * 0.2}, ${height * 0.48})`}>
            <foreignObject x={-80} y={-80} width="180" height="180">
              <div className="flex h-full w-full items-center justify-center">
                <BaseHQ scale={getPlanScale(usageData?.plan)} darkMode={daylightOpacity > 0.3} />
              </div>
            </foreignObject>
          </g>

          {TASK_BOXES.map((box) => (
            <g key={box.id} transform={`translate(${(box.xPct / 100) * width}, ${(box.yPct / 100) * height})`}>
              <foreignObject x={-90} y={-35} width="180" height="70">
                <TaskBox
                  title={box.title}
                  runningCount={taskRunningCounts[box.id] ?? 0}
                  selected={selectedTaskId === box.id}
                  onClick={() => setSelectedTaskId((current) => (current === box.id ? null : box.id))}
                />
              </foreignObject>
            </g>
          ))}

          {AGENT_CONFIGS.map((agent, index) => {
            const status = statusByAgent[agent.id];
            const pos = computeAgentPosition(index, AGENT_CONFIGS.length, status);
            const x = (pos.x / 100) * width;
            const y = (pos.y / 100) * height;
            const selected = selectedTaskId ? TASK_BOXES.find((box) => box.id === selectedTaskId)?.agentIds.includes(agent.id) ?? false : false;

            return (
              <g key={agent.id} transform={`translate(${x}, ${y})`}>
                <foreignObject x={-60} y={-40} width="120" height="100">
                  <div className="flex items-center justify-center">
                    {process.env.NEXT_PUBLIC_RIVE_AGENT_SRC ? (
                      <AgentBotRive
                        agentId={agent.id}
                        status={status}
                        selected={selected}
                        onClick={() => handleAgentClick(agent.id)}
                      />
                    ) : (
                      <AgentBotAnimated
                        agentId={agent.id}
                        status={status}
                        selected={selected}
                        onClick={() => handleAgentClick(agent.id)}
                      />
                    )}
                  </div>
                </foreignObject>
              </g>
            );
          })}
        </svg>

        <div className="absolute left-4 top-4 z-20 w-56">
          <AgentCounterHUD
            agentCounts={agentCounts}
            totalDeployed={totals.deployed}
            totalIdle={totals.idle}
            totalFailed={totals.failed}
          />
        </div>

        <div className="absolute bottom-4 right-4 z-20 w-64">
          <FailedZone failedItems={activities.filter((item) => item.status === 'failed').map((item) => ({ id: item.id, task: item.task }))} />
        </div>

        <ThrowAnimation
          active={throwState.active}
          from={throwState.from}
          to={throwState.to}
          onDone={() => setThrowState((prev) => ({ ...prev, active: false }))}
        />
      </div>
    </div>
  );
}
