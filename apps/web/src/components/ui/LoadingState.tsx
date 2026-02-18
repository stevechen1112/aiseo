import React from 'react';
import { Loader2 } from 'lucide-react';

interface LoadingStateProps {
  /** Message shown below the spinner */
  message?: string;
  /** Number of skeleton rows to show when `variant="skeleton"` */
  rows?: number;
  /** 'spinner' (default) or 'skeleton' */
  variant?: 'spinner' | 'skeleton';
  className?: string;
}

/**
 * LoadingState — consistent loading placeholder with two variants:
 * - `spinner`: animated spinner + optional message
 * - `skeleton`: shimmer placeholder rows
 *
 * @example
 * <LoadingState message="Loading keywords…" />
 * <LoadingState variant="skeleton" rows={5} />
 */
export function LoadingState({ message, rows = 4, variant = 'spinner', className = '' }: LoadingStateProps) {
  if (variant === 'skeleton') {
    return (
      <div className={`space-y-3 ${className}`} aria-busy="true" aria-label="Loading">
        {Array.from({ length: rows }).map((_, i) => (
          <div
            key={i}
            className="h-10 animate-pulse rounded-lg bg-gray-200 dark:bg-gray-700"
            style={{ opacity: 1 - i * 0.1 }}
          />
        ))}
      </div>
    );
  }

  return (
    <div
      className={`flex flex-col items-center justify-center gap-3 py-16 text-gray-500 dark:text-gray-400 ${className}`}
      aria-busy="true"
      aria-label={message ?? 'Loading'}
    >
      <Loader2 className="h-8 w-8 animate-spin" />
      {message && <p className="text-sm">{message}</p>}
    </div>
  );
}
