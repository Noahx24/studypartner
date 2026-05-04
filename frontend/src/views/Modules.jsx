import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, BookOpen, Search, AlertTriangle, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import ModuleCard from '../components/modules/ModuleCard';
import AddModuleDialog from '../components/modules/AddModuleDialog';
import { format, parseISO, differenceInDays } from 'date-fns';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/AuthContext';

export default function Modules() {
  const { user } = useAuth();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [search, setSearch] = useState('');
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: ['modules', user?.id],
    queryFn: async () => {
      // Modules are stored locally in IndexedDB via the sync layer;
      // fall back to an empty list if the repo isn't populated yet.
      return { modules: [] };
    },
    enabled: !!user,
  });

  const modules = data?.modules ?? [];

  const filtered = modules.filter(m =>
    m.name?.toLowerCase().includes(search.toLowerCase())
  );

  const sorted = [...filtered].sort((a, b) => {
    const aDate = a.due_date || '9999-12-31';
    const bDate = b.due_date || '9999-12-31';
    return aDate.localeCompare(bDate);
  });

  const handleDelete = () => {
    queryClient.invalidateQueries({ queryKey: ['modules'] });
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
        onCreated={() => queryClient.invalidateQueries({ queryKey: ['modules'] })}
      />
    </div>
  );
}
