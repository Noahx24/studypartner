import React from 'react';
import { CheckCircle2, Circle, Clock, BookOpen, RotateCcw } from 'lucide-react';
import { cn } from "@/lib/utils";
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';

const complexityColors = {
  light: 'bg-emerald-500/10 text-emerald-600 border-emerald-200',
  moderate: 'bg-amber-500/10 text-amber-600 border-amber-200',
  heavy: 'bg-red-500/10 text-red-600 border-red-200',
};

export default function SessionCard({ session, onComplete, onMiss }) {
  const isCompleted = session.status === 'completed';
  const isMissed = session.status === 'missed';

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "bg-card rounded-2xl p-4 border shadow-sm transition-all duration-300",
        isCompleted && "border-emerald-200 bg-emerald-50/30",
        isMissed && "border-red-200 bg-red-50/20 opacity-60",
        !isCompleted && !isMissed && "border-border/50"
      )}
    >
      <div className="flex items-start gap-3">
        {/* Status Icon */}
        <button
          onClick={() => !isCompleted && onComplete(session)}
          className="mt-0.5 flex-shrink-0"
          disabled={isMissed}
        >
          {isCompleted ? (
            <CheckCircle2 className="w-6 h-6 text-emerald-500" />
          ) : (
            <Circle className="w-6 h-6 text-muted-foreground/40 hover:text-primary transition-colors" />
          )}
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h3 className={cn(
              "font-heading font-semibold text-sm truncate tracking-tight",
              isCompleted && "line-through text-muted-foreground"
            )}>
              {session.title}
            </h3>
            {session.complexity && (
              <span className={cn(
                "text-[10px] font-medium px-2 py-0.5 rounded-full border flex-shrink-0",
                complexityColors[session.complexity]
              )}>
                {session.complexity}
              </span>
            )}
          </div>

          {session.description && (
            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
              {session.description}
            </p>
          )}

          <div className="flex items-center gap-3 mt-2">
            {session.start_time && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {session.start_time}
              </span>
            )}
            {session.duration_minutes && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <BookOpen className="w-3 h-3" />
                {session.duration_minutes} min
              </span>
            )}
            {session.subject && (
              <span className="text-xs font-medium text-primary/70">
                {session.subject}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Action Buttons for non-completed */}
      {!isCompleted && !isMissed && (
        <div className="flex gap-2 mt-3 ml-9">
          <Button
            size="sm"
            onClick={() => onComplete(session)}
            className="h-7 text-xs rounded-lg bg-primary hover:bg-primary/90"
          >
            <CheckCircle2 className="w-3 h-3 mr-1" />
            Done
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onMiss(session)}
            className="h-7 text-xs rounded-lg text-muted-foreground"
          >
            <RotateCcw className="w-3 h-3 mr-1" />
            Skip
          </Button>
        </div>
      )}
    </motion.div>
  );
} 