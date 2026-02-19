'use client';

import { motion } from 'framer-motion';

type ThrowAnimationProps = {
  active: boolean;
  from: { x: number; y: number };
  to: { x: number; y: number };
  onDone?: () => void;
};

export function ThrowAnimation({ active, from, to, onDone }: ThrowAnimationProps) {
  if (!active) return null;

  const midX = (from.x + to.x) / 2;
  const arcTop = Math.min(from.y, to.y) - 120;

  return (
    <motion.div
      className="pointer-events-none absolute h-3 w-3 rounded-full bg-blue-500 shadow"
      initial={{ left: from.x, top: from.y, opacity: 1 }}
      animate={{
        left: [from.x, midX, to.x],
        top: [from.y, arcTop, to.y],
        opacity: [1, 1, 0.2],
      }}
      transition={{ duration: 0.8, ease: 'easeInOut' }}
      onAnimationComplete={onDone}
    />
  );
}
