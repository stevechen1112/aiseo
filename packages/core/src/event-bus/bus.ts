import { randomUUID } from 'node:crypto';

import type { Redis } from 'ioredis';

import type { AgentEvent, AgentEventType } from './types.js';

export type EventBusOptions = {
  redis: Redis;
  prefix?: string;
};

function channelForTenant(prefix: string, tenantId: string) {
  return `${prefix}.events.${tenantId}`;
}

function seqKeyForTenant(prefix: string, tenantId: string) {
  return `${prefix}.events.seq.${tenantId}`;
}

export class EventBus {
  private readonly prefix: string;

  constructor(private readonly options: EventBusOptions) {
    this.prefix = options.prefix ?? 'aiseo';
  }

  async publish(input: {
    tenantId: string;
    projectId?: string;
    type: AgentEventType;
    payload: Record<string, unknown>;
  }): Promise<AgentEvent> {
    const seq = await this.options.redis.incr(seqKeyForTenant(this.prefix, input.tenantId));

    const event: AgentEvent = {
      id: randomUUID(),
      seq,
      tenantId: input.tenantId,
      projectId: input.projectId,
      type: input.type,
      payload: input.payload,
      timestamp: Date.now(),
    };

    await this.options.redis.publish(channelForTenant(this.prefix, input.tenantId), JSON.stringify(event));
    return event;
  }

  subscribe(tenantId: string, onEvent: (event: AgentEvent) => void) {
    const subscriber = this.options.redis.duplicate();
    const channel = channelForTenant(this.prefix, tenantId);

    const handler = (messageChannel: string, message: string) => {
      if (messageChannel !== channel) return;
      try {
        const parsed = JSON.parse(message) as AgentEvent;
        onEvent(parsed);
      } catch {
        // ignore
      }
    };

    subscriber.on('message', handler);

    const start = async () => {
      await subscriber.subscribe(channel);
    };

    const stop = async () => {
      try {
        await subscriber.unsubscribe(channel);
      } finally {
        subscriber.removeListener('message', handler);
        subscriber.disconnect();
      }
    };

    return { start, stop };
  }

  subscribeAll(onEvent: (event: AgentEvent) => void) {
    const subscriber = this.options.redis.duplicate();
    const pattern = `${this.prefix}.events.*`;

    const handler = (_pattern: string, _channel: string, message: string) => {
      try {
        const parsed = JSON.parse(message) as AgentEvent;
        onEvent(parsed);
      } catch {
        // ignore
      }
    };

    subscriber.on('pmessage', handler);

    const start = async () => {
      await subscriber.psubscribe(pattern);
    };

    const stop = async () => {
      try {
        await subscriber.punsubscribe(pattern);
      } finally {
        subscriber.removeListener('pmessage', handler);
        subscriber.disconnect();
      }
    };

    return { start, stop };
  }
}
