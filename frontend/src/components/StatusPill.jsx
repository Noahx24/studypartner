export const StatusPill = ({ status }: { status: 'planned' | 'completed' | 'missed' | 'green' | 'yellow' | 'red' }) => {
  const styles: Record<string, string> = {
    planned: 'bg-zinc-800 text-zinc-200',
    completed: 'bg-emerald-500/20 text-emerald-300',
    missed: 'bg-rose-500/20 text-rose-300',
    green: 'bg-emerald-500/20 text-emerald-300',
    yellow: 'bg-amber-500/20 text-amber-300',
    red: 'bg-rose-500/20 text-rose-300',
  };

  return <span className={`rounded-full px-2 py-1 text-xs capitalize ${styles[status]}`}>{status.replace('_', ' ')}</span>;
};
