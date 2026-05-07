import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, BookOpen, Search, Sparkles, FileText, Pencil, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import AddModuleDialog from '../components/modules/AddModuleDialog';
import FetchFromMyModulesButton from '../components/modules/FetchFromMyModulesButton';
import { format, parseISO, differenceInDays } from 'date-fns';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/AuthContext';
import { api } from '@/api/client';

/**
 * Module list with the parsed-unit count visible for each module,
 * driven by the new GET /modules endpoint. The previous version
 * called a stub queryFn that always returned [], so even after a
 * real upload the page showed "No modules yet" — the AI-parsed units
 * were sitting in the DB but never reached the UI.
 */
export default function Modules() {
  const { user } = useAuth();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [search, setSearch] = useState('');
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['modules-list', user?.id],
    queryFn: () => api.listModules(),
    enabled: !!user,
  });

  const modules = data?.modules ?? [];

  const filtered = useMemo(
    () =>
      modules.filter((m) =>
        m.name?.toLowerCase().includes(search.toLowerCase()),
      ),
    [modules, search],
  );

  const handleCreated = () => {
    queryClient.invalidateQueries({ queryKey: ['modules-list'] });
  };

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

      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <FetchFromMyModulesButton className="rounded-xl flex-1" />
        <Button asChild variant="outline" className="rounded-xl flex-1">
          <Link to="/modules/materials">
            <Sparkles className="w-4 h-4 mr-2" />
            Pick materials for AI
          </Link>
        </Button>
      </div>

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

      {isLoading ? (
        <div className="text-center py-12 text-sm text-muted-foreground">Loading…</div>
      ) : modules.length === 0 ? (
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
          {filtered.map((m) => (
            <ModuleRow key={m.id} module={m} />
          ))}
        </div>
      )}

      <AddModuleDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onCreated={handleCreated}
      />
    </div>
  );
}

function ModuleRow({ module: m }) {
  const days = m.next_due_date
    ? differenceInDays(parseISO(m.next_due_date), new Date())
    : null;
  const dueLabel =
    days == null
      ? null
      : days < 0
      ? 'Overdue'
      : days === 0
      ? 'Due today'
      : days === 1
      ? 'Due tomorrow'
      : `${format(parseISO(m.next_due_date), 'MMM d')}`;
  const urgent = days != null && days <= 3;

  const hasUnits = m.unit_count > 0;

  return (
    <Link
      to={`/modules/${m.id}/units`}
      className="block bg-card rounded-2xl border border-border/50 shadow-sm p-4 hover:border-primary/30 transition-colors"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-sm truncate">{m.name}</h3>
          <p className="text-xs text-muted-foreground mt-0.5 capitalize">
            {m.module_type === 'year' ? 'Year-long' : 'Semester'}
          </p>
        </div>
        {dueLabel && (
          <Badge
            className={cn(
              'text-[10px] h-5 px-2 shrink-0',
              urgent ? 'bg-destructive/10 text-destructive' : 'bg-muted text-muted-foreground',
            )}
          >
            <Calendar className="w-3 h-3 mr-1" />
            {dueLabel}
          </Badge>
        )}
      </div>

      <div className="mt-3 flex items-center gap-3 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <FileText className="w-3 h-3" />
          {hasUnits ? `${m.unit_count} units · ${m.subtopic_count} subtopics` : 'Not parsed yet'}
        </span>
        {hasUnits && (
          <span className="inline-flex items-center gap-1 ml-auto text-primary">
            <Pencil className="w-3 h-3" />
            Edit parsed units
          </span>
        )}
      </div>
    </Link>
  );
}
