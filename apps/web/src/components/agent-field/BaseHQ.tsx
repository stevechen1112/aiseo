'use client';

type BaseHQProps = {
  scale?: number;
  darkMode?: boolean;
};

export function BaseHQ({ scale = 1, darkMode = false }: BaseHQProps) {
  return (
    <div className="relative" style={{ transform: `scale(${scale})` }}>
      <svg viewBox="0 0 160 140" className="h-28 w-28">
        <ellipse cx="80" cy="124" rx="54" ry="12" fill={darkMode ? '#1f2937' : '#d1fae5'} />
        <rect x="36" y="54" width="88" height="58" rx="14" fill={darkMode ? '#0f172a' : '#f3f4f6'} stroke="#94a3b8" strokeWidth="3" />
        <polygon points="80,20 128,60 32,60" fill={darkMode ? '#1e293b' : '#e2e8f0'} stroke="#94a3b8" strokeWidth="3" />
        <circle cx="80" cy="78" r="12" fill="#60a5fa" />
        <rect x="74" y="68" width="12" height="20" rx="3" fill="#eff6ff" />
      </svg>
      <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-blue-600/10 px-2 py-0.5 text-[10px] text-blue-700 dark:text-blue-300">
        Base HQ
      </div>
    </div>
  );
}
