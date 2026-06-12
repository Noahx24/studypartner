import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, BookOpen, Search, AlertTriangle, Calendar, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import ModuleCard from '../components/modules/ModuleCard';
import AddModuleDialog from '../components/modules/AddModuleDialog';
import FetchFromMyModulesButton from '../components/modules/FetchFromMyModulesButton';
import { format, parseISO, differenceInDays } from 'date-fns';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/AuthContext';
import { api } from '@/api/client';
import { modulesRepo } from '@/db/repos';

export default function Modules() {
  const { user } = useAuth();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [search, setSearch] = useState('');
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: ['modules', user?.id],
    queryFn: async () => {
      // Server first (tiny payload: id/name/type/next deadline per module),
      // refreshing the IndexedDB cache; offline falls back to the cache so
      // the list still renders with no connection.
      try {
        const { modules } = await api.listModules();
        await modulesRepo.upsertMany(
          modules.map((m) => ({
            id: m.id,
            user_id: user.id,
            name: m.name,
            module_type: m.module_type,
            next_due_date: m.next_due_date,
          })),
        );
        return { modules };
      } catch {
        return { modules: await modulesRepo.listForUser(user.id) };
      }
    },
    enabled: !!user,
  });

  const modules = data?.modules ?? [];

  const filtered = modules.filter(m =>
    m.name?.toLowerCase().includes(search.toLowerCase())
  );

  const sorted = [...filtered].sort((a, b) => {
    const aDate = a.next_due_date || '9999-12-31';
    const bDate = b.next_due_date || '9999-12-31';
    return aDate.localeCompare(bDate);
  });

  const handleDelete = () => {
    queryClient.invalidateQueries({ queryKey: ['modules'] });
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="font-heading text-3xl font-bold tracking-tight">Modules</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {modules.length === 0 ? 'Nothing here yet' : `${modules.length} active`}
          </p>
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
            Choose study materials
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
            <ModuleCard
              key={module.id}
              module={{
                ...module,
                title: module.name,
                type: module.module_type,
                assignment_date: module.next_due_date,
              }}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      <AddModuleDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onCreated={() => queryClient.invalidateQueries({ queryKey: ['modules'] })}
      />
    </div>
  );
}
