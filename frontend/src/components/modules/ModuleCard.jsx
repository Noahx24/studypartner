import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { FileText, BookOpen, File, GraduationCap, Presentation, MoreVertical, Trash2, ChevronDown, ChevronUp, Calendar, ClipboardCheck, Pencil } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { format, parseISO, differenceInDays } from 'date-fns';

const typeIcons = {
  notes: FileText, textbook: BookOpen, pdf: File,
  past_paper: GraduationCap, slides: Presentation, other: File,
};

const priorityColors = {
  low: 'bg-muted-foreground/20 text-muted-foreground',
  medium: 'bg-amber-100 text-amber-700',
  high: 'bg-orange-100 text-orange-700',
  critical: 'bg-destructive/10 text-destructive',
};

const complexityColors = {
  light: 'text-emerald-600',
  moderate: 'text-amber-600',
  heavy: 'text-red-600',
};

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
  const Icon = typeIcons[module.type] || File;
  const units = module.units || [];

  return (
    <div className="bg-card rounded-2xl border border-border/50 shadow-sm overflow-hidden">
      <div className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-primary/5 flex items-center justify-center flex-shrink-0">
              <Icon className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-semibold text-sm">{module.title}</h3>
                <Badge className={cn("text-[10px] h-4 px-1.5", priorityColors[module.priority || 'medium'])}>
                  {module.priority || 'medium'}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">{module.subject}</p>
            </div>
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

        {/* Deadlines */}
        {(module.exam_date || module.assignment_date) && (
          <div className="flex flex-wrap gap-2 mt-2">
            {module.exam_date && <DeadlineBadge date={module.exam_date} label="Exam" />}
            {module.assignment_date && <DeadlineBadge date={module.assignment_date} label="Assignment" />}
          </div>
        )}

        {/* Progress */}
        <div className="mt-3 flex items-center gap-2">
          <div className="flex-1">
            <Progress value={module.progress_percent || 0} className="h-1.5" />
          </div>
          <span className="text-[10px] text-muted-foreground font-medium w-8 text-right">
            {module.progress_percent || 0}%
          </span>
        </div>

        {/* Meta */}
        <div className="flex items-center gap-3 mt-2 text-[11px] text-muted-foreground">
          {module.estimated_hours && <span>{module.estimated_hours}h total</span>}
          {module.complexity && (
            <span className={cn("capitalize font-medium", complexityColors[module.complexity])}>
              {module.complexity}
            </span>
          )}
          {units.length > 0 && <span>{units.length} units</span>}
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