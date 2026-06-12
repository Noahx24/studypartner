import React from 'react';
import { Check, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import { moduleColor, moduleCode } from '@/lib/moduleColors';

/**
 * Session card, per the design system:
 *   ┌────────────────────────────────────────────┐
 *   │ ▢ CODE  45 min                        (✓) │
 *   │   Bold session title                       │
 *   └────────────────────────────────────────────┘
 * Mono metadata row, big readable title, colored module square,
 * circular check on the right. Completed = strikethrough + filled check.
 */
export default function SessionCard({ session, onComplete, onMiss }) {
  const isCompleted = session.status === 'completed';
  const isMissed = session.status === 'missed';
  const color = moduleColor(session.module_id);
  const code = moduleCode(session.subject);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        'bg-card rounded-2xl p-4 border shadow-sm transition-all duration-300',
        isMissed && 'opacity-60',
        'border-border/50',
      )}
    >
      <div className="flex items-start gap-3">
        <span className={cn('mt-1 w-9 h-9 rounded-xl shrink-0', color.square)} />

        <div className="flex-1 min-w-0">
          <p className="font-mono text-xs text-muted-foreground">
            {code && <span className="font-semibold mr-2">{code}</span>}
            {session.duration_minutes ? `${session.duration_minutes} min` : ''}
            {session.start_time ? ` · ${session.start_time}` : ''}
          </p>
          <h3
            className={cn(
              'font-heading font-semibold text-base mt-0.5 tracking-tight',
              isCompleted && 'line-through text-muted-foreground',
            )}
          >
            {session.title}
          </h3>
          {isMissed && (
            <span className="inline-block mt-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-destructive/10 text-destructive">
              Missed
            </span>
          )}
        </div>

        <button
          onClick={() => !isCompleted && onComplete(session)}
          disabled={isMissed}
          aria-label={isCompleted ? 'Completed' : 'Mark as done'}
          className={cn(
            'mt-1 w-10 h-10 rounded-full border-2 shrink-0 flex items-center justify-center transition-all',
            isCompleted
              ? 'bg-primary border-primary text-primary-foreground'
              : 'border-border hover:border-primary text-transparent hover:text-primary',
          )}
        >
          <Check className="w-5 h-5" strokeWidth={3} />
        </button>
      </div>

      {!isCompleted && !isMissed && (
        <div className="flex justify-end mt-1">
          <button
            onClick={() => onMiss(session)}
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 px-2 py-1"
          >
            <RotateCcw className="w-3 h-3" />
            Skip
          </button>
        </div>
      )}
    </motion.div>
  );
}
