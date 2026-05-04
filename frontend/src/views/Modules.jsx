import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, BookOpen, Search, AlertTriangle, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import ModuleCard from '../components/modules/ModuleCard';
import AddModuleDialog from '../components/modules/AddModuleDialog';
import { toast } from 'sonner';
import { format, parseISO, differenceInDays } from 'date-fns';
import { cn } from '@/lib/utils';

export default function Modules() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [search, setSearch] = useState('');
  const queryClient = useQueryClient();

  const filtered = modules.filter(m =>
    m.title?.toLowerCase().includes(search.toLowerCase()) ||
    m.subject?.toLowerCase().includes(search.toLowerCase())
  );

  // Sort: critical deadlines first
  const sorted = [...filtered].sort((a, b) => {
    const aDate = a.assignment_date || a.exam_date || '9999-12-31';
    const bDate = b.assignment_date || b.exam_date || '9999-12-31';
    return aDate.localeCompare(bDate);
  });


  // Upcoming deadlines
  const upcomingDeadlines = modules
    .filter(m => {
      const d = m.assignment_date || m.exam_date;
      if (!d) return false;
      const days = differenceInDays(parseISO(d), new Date());
      return days >= 0 && days <= 7;
    })
    .sort((a, b) => {
      const aDate = a.assignment_date || a.exam_date;
      const bDate = b.assignment_date || b.exam_date;
      return aDate.localeCompare(bDate);
    });

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="font-heading text-2xl font-bold">Modules</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{modules.length} modules</p>
        </div>
        <Button onClick={() => setDialogOpen(true)} className="rounded-xl">
          <Plus className="w-4 h-4 mr-1" /> Add
        </Button>
      </div>

      {/* Deadline Banner */}
      {upcomingDeadlines.length > 0 && (
        <div className="mb-4 bg-destructive/5 border border-destructive/20 rounded-2xl p-3">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-4 h-4 text-destructive" />
            <span className="text-xs font-semibold text-destructive">Upcoming Deadlines</span>
          </div>
          <div className="space-y-1">
            {upcomingDeadlines.map(m => {
              const d = m.assignment_date || m.exam_date;
              const days = differenceInDays(parseISO(d), new Date());
              const isAssignment = !!m.assignment_date;
              return (
                <div key={m.id} className="flex items-center justify-between text-xs">
                  <span className="font-medium truncate">{m.title}</span>
                  <span className={cn(
                    "ml-2 flex-shrink-0 flex items-center gap-1",
                    days <= 2 ? "text-destructive font-bold" : "text-muted-foreground"
                  )}>
                    <Calendar className="w-3 h-3" />
                    {days === 0 ? 'Today!' : days === 1 ? 'Tomorrow' : `${days}d`}
                    {' · '}{isAssignment ? 'Assignment' : 'Exam'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {modules.length > 3 && (
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search modules..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 rounded-xl"
          />
        </div>
      )}

      {modules.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-16 h-16 rounded-2xl bg-primary/5 flex items-center justify-center mx-auto mb-4">
            <BookOpen className="w-8 h-8 text-primary/40" />
          </div>
          <h3 className="font-heading font-semibold text-lg mb-1">No modules yet</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Upload your notes, textbooks, or PDFs — AI will parse units automatically
          </p>
          <Button onClick={() => setDialogOpen(true)} className="rounded-xl">
            <Plus className="w-4 h-4 mr-1" /> Add Module
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {sorted.map(module => (
            <ModuleCard key={module.id} module={module} onDelete={handleDelete} />
          ))}
        </div>
      )}

      <AddModuleDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onCreated={() => queryClient.invalidateQueries({ queryKey: ['materials'] })}
      />
    </div>
  );
}