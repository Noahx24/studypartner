import { prettyDate } from '../utils/date';

type CalendarDay = {
  date: string;
  totalMinutes: number;
  sessions: number;
  deadlines: Array<{ title: string; priority: 'low' | 'medium' | 'high' }>;
};

const intensity = (minutes: number) => {
  if (minutes === 0) return 'bg-white';
  if (minutes <= 120) return 'bg-brand-100';
  if (minutes <= 300) return 'bg-brand-300';
  return 'bg-brand-500 text-white';
};

const dotClass = {
  low: 'bg-amber-300',
  medium: 'bg-amber-500',
  high: 'bg-rose-500',
};

export function WeeklyGrid({ days, mode }: { days: CalendarDay[]; mode: 'week' | 'month' }) {
  return (
    <div className={`grid gap-2 ${mode === 'week' ? 'grid-cols-2' : 'grid-cols-3 md:grid-cols-7'}`}>
      {days.map((day) => (
        <article key={day.date} className={`rounded-xl border border-slate-200 p-3 ${intensity(day.totalMinutes)}`}>
          <p className="text-xs font-medium">{prettyDate(day.date)}</p>
          <p className="mt-2 text-sm">{Math.round(day.totalMinutes / 60)}h planned</p>
          <p className="text-xs opacity-80">{day.sessions} sessions</p>
          <div className="mt-2 flex flex-wrap gap-1">
            {day.deadlines.map((deadline, index) => (
              <span key={`${day.date}-${index}`} className="inline-flex items-center gap-1 rounded-full bg-white/75 px-2 py-1 text-[10px] text-slate-700">
                <span className={`h-2 w-2 rounded-full ${dotClass[deadline.priority]}`} />
                {deadline.title}
              </span>
            ))}
          </div>
        </article>
      ))}
    </div>
  );
}
