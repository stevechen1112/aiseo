'use client';

type TaskBoxProps = {
  title: string;
  runningCount: number;
  selected?: boolean;
  onClick?: () => void;
};

export function TaskBox({ title, runningCount, selected = false, onClick }: TaskBoxProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border px-3 py-2 text-left shadow-sm transition ${
        selected
          ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30'
          : 'border-gray-200 bg-white dark:bg-gray-800 dark:border-gray-700 hover:border-blue-300'
      }`}
    >
      <p className="text-xs font-semibold text-gray-800 dark:text-gray-200">{title}</p>
      <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">Running {runningCount}</p>
    </button>
  );
}
