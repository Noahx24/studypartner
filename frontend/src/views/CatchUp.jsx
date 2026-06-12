import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, RefreshCw, Loader2, PartyPopper } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { useAuth } from '@/lib/AuthContext';
import { api } from '@/api/client';
import { Button } from '@/components/ui/button';
import { moduleColor, moduleCode } from '@/lib/moduleColors';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

function fmtHours(mins) {
  if (!mins) return '0 min';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h ? `${h}h${m ? ` ${m}m` : ''}` : `${m} min`;
}

export default function CatchUp() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [busy, setBusy] = React.useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['catch-up', user?.id],
    queryFn: () => api.getCatchUp(user.id),
    enabled: !!user,
  });

  const missed = data?.sessions ?? [];

  const rescheduleAll = async () => {
    setBusy(true);
    try {
      const res = await api.reschedule({ user_id: user.id });
      toast.success(
        `Rescheduled into your free time${res.rescheduled ? ` — ${res.rescheduled} sessions placed` : ''}.`,
      );
      queryClient.invalidateQueries({ queryKey: ['catch-up'] });
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      queryClient.invalidateQueries({ queryKey: ['sessions-range'] });
    } catch (err) {
      toast.error(err.message || "Couldn't reschedule right now.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="pb-8">
      <div className="flex items-center gap-3 mb-1">
        <Button variant="ghost" size="icon" className="rounded-xl -ml-2" onClick={() => navigate(-1)}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <h1 className="font-heading text-3xl font-bold tracking-tight">Catch up</h1>
      </div>

      {isLoading ? (
        <div className="space-y-3 mt-4">
          {Array(3).fill(0).map((_, i) => (
            <div key={i} className="h-24 rounded-2xl bg-muted animate-pulse" />
          ))}
        </div>
      ) : missed.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-16 h-16 rounded-2xl bg-emerald-100 flex items-center justify-center mx-auto mb-4">
            <PartyPopper className="w-8 h-8 text-emerald-600" />
          </div>
          <h3 className="font-heading font-semibold text-lg mb-1">Nothing to catch up on</h3>
          <p className="text-sm text-muted-foreground">You're on top of your plan. Nice work.</p>
        </div>
      ) : (
        <>
          <div className="inline-flex items-center gap-2 text-sm font-medium text-destructive bg-destructive/10 rounded-full px-3 py-1 mt-1 mb-4">
            <span className="w-1.5 h-1.5 rounded-full bg-destructive" />
            {data.count} missed · {fmtHours(data.minutes_to_recover)} to recover
          </div>

          <div className="rounded-2xl bg-secondary border border-primary/10 p-4 mb-5">
            <h2 className="font-heading font-bold text-base">Reschedule everything</h2>
            <p className="text-sm text-muted-foreground mt-1 mb-3">
              We'll refit missed work into your upcoming free time, around your
              availability — no single day gets overloaded.
            </p>
            <Button className="w-full rounded-xl h-11" onClick={rescheduleAll} disabled={busy}>
              {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
              Reschedule all ({data.count})
            </Button>
          </div>

          <div className="space-y-3">
            {missed.map((s) => {
              const color = moduleColor(s.module_id);
              return (
                <div key={s.id} className="bg-card rounded-2xl p-4 border border-border/50 shadow-sm">
                  <div className="flex items-start gap-3">
                    <span className={cn('mt-0.5 w-9 h-9 rounded-xl shrink-0', color.square)} />
                    <div className="flex-1 min-w-0">
                      <p className="font-mono text-xs text-muted-foreground">
                        <span className="font-semibold mr-2">{moduleCode(s.subject)}</span>
                        {s.duration_minutes} min
                      </p>
                      <h3 className="font-heading font-semibold text-base mt-0.5 tracking-tight">{s.title}</h3>
                      <p className="font-mono text-xs text-muted-foreground mt-1">
                        missed {format(parseISO(s.session_date), 'EEE d MMM')}
                      </p>
                    </div>
                    <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-destructive/10 text-destructive shrink-0">
                      Missed
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
