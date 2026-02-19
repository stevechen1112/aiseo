'use client';

type FailedZoneProps = {
  failedItems: Array<{ id: string; task: string }>;
};

export function FailedZone({ failedItems }: FailedZoneProps) {
  return (
    <div className="rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50/80 dark:bg-red-950/20 p-3">
      <p className="text-xs font-semibold text-red-700 dark:text-red-300">Failed Zone</p>
      {failedItems.length === 0 ? (
        <p className="mt-1 text-[11px] text-red-600/80 dark:text-red-300/80">目前沒有失敗任務</p>
      ) : (
        <ul className="mt-1 space-y-1 text-[11px] text-red-700 dark:text-red-300">
          {failedItems.slice(0, 3).map((item) => (
            <li key={item.id} className="truncate">💀 {item.task}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
