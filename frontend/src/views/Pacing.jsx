import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, TrendingUp } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { useAuth } from '@/lib/AuthContext';
import { api } from '@/api/client';
import { Button } from '@/components/ui/button';
import { moduleColor, moduleCode } from '@/lib/moduleColors';
import { cn } from '@/lib/utils';

// Pace ratio = actual / estimated. >1 means slower than planned (behind).
function paceLabel(ratio) {
  if (ratio == null) return { text: 'No data yet', tone: 'muted' };
  if (ratio <= 0.95) return { text: `${ratio.toFixed(1)}× ahead`, tone: 'good' };
  if (ratio <= 1.15) return { text: `${ratio.toFixed(1)}× on pace`, tone: 'muted' };
  return { text: `${ratio.toFixed(1)}× behind`, tone: ratio > 1.3 ? 'bad' : 'warn' };
}

const TONE = {
  good: 'bg-emerald-100 text-emerald-700',
  warn: 'bg-amber-100 text-amber-700',
  bad: 'bg-destructive/10 text-destructive',
  muted: 'bg-muted text-muted-foreground',
};

export default function Pacing() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ['pacing', user?.id],
    queryFn: () => api.getPacing(user.id),
    enabled: !!user,
  });

  const m = data?.multiplier;
  const overall = paceLabel(m);
  const completedDays = (data?.consistency ?? []).filter((d) => d.completed > 0).length;
  const headline =
    m == null || data?.samples < 1
      ? null
      : m <= 0.95
        ? `~${Math.round((1 - m) * 100)}% faster than planned`
        : m <= 1.05
          ? 'Right on plan'
          : `~${Math.round((m - 1) * 100)}% slower than planned`;

  return (
    <div className="pb-8">
      <div className="flex items-center gap-3 mb-1">
        <Button variant="ghost" size="icon" className="rounded-xl -ml-2" onClick={() => navigate(-1)}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div>
          <h1 className="font-heading text-3xl font-bold tracking-tight">Pacing</h1>
          <p className="text-sm text-muted-foreground -mt-0.5">How you're really tracking</p>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3 mt-4">
          {Array(3).fill(0).map((_, i) => (
            <div key={i} className="h-28 rounded-2xl bg-muted animate-pulse" />
          ))}
        </div>
      ) : !data || data.samples < 1 ? (
        <div className="text-center py-16">
          <div className="w-16 h-16 rounded-2xl bg-primary/5 flex items-center justify-center mx-auto mb-4">
            <TrendingUp className="w-8 h-8 text-primary/40" />
          </div>
          <h3 className="font-heading font-semibold text-lg mb-1">No pacing data yet</h3>
          <p className="text-sm text-muted-foreground">
            Mark sessions done and tell us how long they took — your pace builds up here.
          </p>
        </div>
      ) : (
        <div className="mt-4 space-y-5">
          {/* Headline multiplier */}
          <div className="bg-card rounded-2xl p-5 border shadow-sm flex items-center gap-4">
            <p className="font-heading font-bold text-5xl tracking-tight text-amber-600">
              {m.toFixed(1)}×
            </p>
            <div>
              {headline && <p className="font-heading font-bold text-amber-700">{headline}</p>}
              <p className="text-sm text-muted-foreground mt-0.5">
                {m > 1.05
                  ? "At this pace your week runs long — we've already stretched the plan to fit."
                  : 'Your estimates are well matched to how you actually study.'}
              </p>
            </div>
          </div>

          {/* By module */}
          {data.per_module.length > 0 && (
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
                By module
              </p>
              <div className="bg-card rounded-2xl border shadow-sm divide-y">
                {data.per_module.map((row) => {
                  const color = moduleColor(row.module_id);
                  const label = paceLabel(row.ratio);
                  return (
                    <div key={row.module_id} className="flex items-center gap-3 p-4">
                      <span className={cn('w-9 h-9 rounded-xl shrink-0', color.square)} />
                      <span className="font-mono text-sm font-semibold flex-1">
                        {moduleCode(row.module_name)}
                      </span>
                      <span className={cn('text-xs font-semibold px-2.5 py-1 rounded-full', TONE[label.tone])}>
                        {label.text}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Consistency strip */}
          <div className="bg-card rounded-2xl p-4 border shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-heading font-bold text-base">Consistency</h2>
              <span className="font-mono text-xs text-muted-foreground">
                {completedDays} of 7 days
              </span>
            </div>
            <div className="flex justify-between">
              {data.consistency.map((d) => {
                const dot =
                  d.completed > 0 ? 'bg-emerald-400' : d.missed > 0 ? 'bg-destructive' : 'bg-muted';
                return (
                  <div key={d.date} className="flex flex-col items-center gap-1.5">
                    <span className={cn('w-7 h-7 rounded-full', dot)} />
                    <span className="text-[10px] text-muted-foreground">
                      {format(parseISO(d.date), 'EEEEE')}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
