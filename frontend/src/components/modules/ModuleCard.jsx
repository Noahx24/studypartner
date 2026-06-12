import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { MoreVertical, Trash2, ChevronDown, ChevronUp, Calendar, Pencil } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { format, parseISO, differenceInDays } from 'date-fns';
import { moduleColor, moduleCode } from '@/lib/moduleColors';

function DeadlineBadge({ date, label }) {
  if (!date) return null;
  const days = differenceInDays(parseISO(date), new Date());
  const urgent = days <= 3;
  return (
    <div className={cn(
      "flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-medium",
      urgent ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground"
    )}>
      <Calendar className="w-3 h-3" />
      <span>{label}: {days < 0 ? 'Overdue' : days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : format(parseISO(date), 'MMM d')}</span>
    </div>
  );
}

export default function ModuleCard({ module, onDelete }) {
  const [expanded, setExpanded] = useState(false);
  const units = module.units || [];
  const color = moduleColor(module.id);
  const code = moduleCode(module.title);
  const progress = module.progress_percent || 0;

  return (
    <div className="bg-card rounded-2xl border border-border/50 shadow-sm overflow-hidden">
      <div className="p-4 flex gap-3">
        {/* Module accent bar */}
        <span className={cn('w-1.5 rounded-full self-stretch shrink-0', color.bar)} />

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <p className="font-mono text-xs font-semibold text-muted-foreground">{code}</p>
              <h3 className="font-heading font-bold text-base tracking-tight mt-0.5 truncate">
                {module.title}
              </h3>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7 -mt-1 -mr-1 flex-shrink-0">
                  <MoreVertical className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem asChild>
                  <Link to={`/modules/${module.id}/units`}>
                    <Pencil className="w-4 h-4 mr-2" /> Edit parsed units
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onDelete(module)} className="text-destructive">
                  <Trash2 className="w-4 h-4 mr-2" /> Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Meta */}
          {(module.estimated_hours || units.length > 0) && (
            <p className="font-mono text-xs text-muted-foreground mt-1">
              {[
                units.length > 0 ? `${units.length} units` : null,
                module.estimated_hours ? `~${module.estimated_hours} h` : null,
              ].filter(Boolean).join(' · ')}
            </p>
          )}

          {/* Deadlines */}
          {(module.exam_date || module.assignment_date) && (
            <div className="flex flex-wrap gap-2 mt-2">
              {module.exam_date && <DeadlineBadge date={module.exam_date} label="Exam" />}
              {module.assignment_date && <DeadlineBadge date={module.assignment_date} label="Due" />}
            </div>
          )}

          {/* Progress */}
          <div className="mt-3 flex items-center gap-3">
            <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
              <div
                className={cn('h-full rounded-full transition-all', color.progress)}
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="font-mono text-xs font-semibold w-9 text-right">{progress}%</span>
          </div>
        </div>
      </div>

      {/* Units Section */}
      {units.length > 0 && (
        <div className="border-t border-border/50">
          <button
            onClick={() => setExpanded(!expanded)}
            className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <span>Units ({units.length})</span>
            {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>

          {expanded && (
            <div className="px-4 pb-3 space-y-2">
              {units.map((unit, i) => (
                <div key={i} className="flex items-start gap-2 p-2.5 rounded-xl bg-muted/40">
                  <div className={cn(
                    "w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 mt-0.5",
                    unit.status === 'completed' ? "bg-emerald-500 text-white" :
                    unit.status === 'in_progress' ? "bg-primary text-white" :
                    "bg-muted-foreground/20 text-muted-foreground"
                  )}>
                    {unit.number || i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium leading-tight">{unit.title}</p>
                    {unit.summary && (
                      <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">{unit.summary}</p>
                    )}
                    {unit.estimated_hours && (
                      <p className="text-[10px] text-muted-foreground mt-1">{unit.estimated_hours}h</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}