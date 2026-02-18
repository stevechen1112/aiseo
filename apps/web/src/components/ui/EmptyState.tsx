import React from 'react';
import { Inbox } from 'lucide-react';

interface EmptyStateProps {
  /** Icon to show (defaults to Inbox). Must be a React element. */
  icon?: React.ReactNode;
  /** Primary heading */
  title: string;
  /** Optional supporting text */
  description?: string;
  /** Optional CTA button */
  action?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
}

/**
 * EmptyState — consistent zero-results / no-data placeholder.
 *
 * @example
 * <EmptyState
 *   title="No keywords found"
 *   description="Add your first keyword to start tracking."
 *   action={{ label: 'Add keyword', onClick: () => setOpen(true) }}
 * />
 */
export function EmptyState({ icon, title, description, action, className = '' }: EmptyStateProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/40 p-10 text-center ${className}`}
    >
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500">
        {icon ?? <Inbox className="h-7 w-7" />}
      </div>
      <h3 className="mb-1 text-sm font-semibold text-gray-900 dark:text-white">{title}</h3>
      {description && (
        <p className="mb-5 max-w-xs text-sm text-gray-500 dark:text-gray-400">{description}</p>
      )}
      {action && (
        <button
          onClick={action.onClick}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
