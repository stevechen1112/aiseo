'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3001/ws/events';

export type WebSocketStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

interface WebSocketMessage {
  type: string;
  data: unknown;
  timestamp: string;
}

interface UseWebSocketOptions {
  onMessage?: (message: WebSocketMessage) => void;
  onStatusChange?: (status: WebSocketStatus) => void;
  reconnect?: boolean;
  reconnectInterval?: number;
  token?: string;
  enabled?: boolean;
}

export function useWebSocket(options: UseWebSocketOptions = {}) {
  const {
    onMessage,
    onStatusChange,
    reconnect = true,
    reconnectInterval = 3000,
    token,
    enabled = true,
  } = options;

  const [status, setStatus] = useState<WebSocketStatus>('disconnected');
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();
  const reconnectAttemptsRef = useRef(0);
  const maxReconnectAttempts = 5;

  // Keep latest callbacks without forcing reconnects on every render.
  const onMessageRef = useRef<UseWebSocketOptions['onMessage']>(onMessage);
  const onStatusChangeRef = useRef<UseWebSocketOptions['onStatusChange']>(onStatusChange);

  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  useEffect(() => {
    onStatusChangeRef.current = onStatusChange;
  }, [onStatusChange]);

  const updateStatus = useCallback((newStatus: WebSocketStatus) => {
    setStatus(newStatus);
    onStatusChangeRef.current?.(newStatus);
  }, []);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    updateStatus('connecting');

    try {
      const url = token ? `${WS_URL}?token=${token}` : WS_URL;
      const ws = new WebSocket(url);

      ws.onopen = () => {
        updateStatus('connected');
        reconnectAttemptsRef.current = 0;
        console.log('WebSocket connected');
      };

      ws.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data);
          onMessageRef.current?.(message);
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error);
        }
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        updateStatus('error');
      };

      ws.onclose = () => {
        updateStatus('disconnected');
        console.log('WebSocket disconnected');

        if (reconnect && reconnectAttemptsRef.current < maxReconnectAttempts) {
          reconnectAttemptsRef.current++;
          console.log(`Reconnecting... Attempt ${reconnectAttemptsRef.current}`);
          
          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, reconnectInterval);
        }
      };

      wsRef.current = ws;
    } catch (error) {
      console.error('Failed to create WebSocket:', error);
      updateStatus('error');
    }
  }, [token, reconnect, reconnectInterval, updateStatus]);

  // Reset reconnect counter whenever the token changes so a refreshed token
  // always gets a full 5 attempts instead of being blocked by a previous failure.
  useEffect(() => {
    reconnectAttemptsRef.current = 0;
  }, [token]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    updateStatus('disconnected');
  }, [updateStatus]);

  const send = useCallback((type: string, data: unknown) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      const message: WebSocketMessage = {
        type,
        data,
        timestamp: new Date().toISOString(),
      };
      wsRef.current.send(JSON.stringify(message));
    } else {
      console.warn('WebSocket is not connected. Message not sent.');
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      disconnect();
      return;
    }

    connect();

    return () => {
      disconnect();
    };
  }, [connect, disconnect, enabled]);

  return {
    status,
    send,
    connect,
    disconnect,
  };
}

// Event subscription helper
export interface EventSubscription {
  unsubscribe: () => void;
}

export function useWebSocketEvent(
  eventType: string,
  handler: (data: unknown) => void,
  token?: string
): WebSocketStatus {
  const { status } = useWebSocket({
    token,
    onMessage: (message) => {
      if (message.type === eventType) {
        handler(message.data);
      }
    },
  });

  return status;
}

// Available event types (from event-bus/types.ts)
export const WebSocketEvents = {
  // Agent events
  AGENT_TASK_CREATED: 'agent.task.created',
  AGENT_TASK_STARTED: 'agent.task.started',
  AGENT_TASK_COMPLETED: 'agent.task.completed',
  AGENT_TASK_FAILED: 'agent.task.failed',
  
  // SERP events
  SERP_RANK_UPDATED: 'serp.rank.updated',
  SERP_RANK_ANOMALY: 'serp.rank.anomaly',
  
  // Content events
  CONTENT_GENERATED: 'content.generated',
  CONTENT_PUBLISHED: 'content.published',
  
  // Technical events
  TECHNICAL_ISSUE_FOUND: 'technical.issue.found',
  TECHNICAL_ISSUE_RESOLVED: 'technical.issue.resolved',
  
  // Backlink events
  BACKLINK_ACQUIRED: 'backlink.acquired',
  BACKLINK_LOST: 'backlink.lost',
  
  // Performance events
  PAGESPEED_ALERT_CRITICAL: 'pagespeed.alert.critical',
  
  // Workflow events
  WORKFLOW_STARTED: 'workflow.started',
  WORKFLOW_STAGE_COMPLETED: 'workflow.stage.completed',
  WORKFLOW_COMPLETED: 'workflow.completed',
  WORKFLOW_FAILED: 'workflow.failed',
} as const;

export type WebSocketEventType = typeof WebSocketEvents[keyof typeof WebSocketEvents];
