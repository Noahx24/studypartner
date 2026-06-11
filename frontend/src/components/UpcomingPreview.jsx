import React from 'react';
import { format, parseISO } from 'date-fns';
import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function UpcomingPreview({ sessions }) {
  const today = format(new Date(), 'yyyy-MM-dd');
  const upcoming = sessions
    .filter(s => s.session_date && s.session_date > today && s.status === 'planned')
    .sort((a, b) => a.session_date.localeCompare(b.session_date))
    .slice(0, 3);

  if (upcoming.length === 0) return null;

  return (
    <div className="mt-8">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-heading font-semibold text-base">Coming Up</h2>
        <Link to="/plan" className="text-xs text-primary font-medium flex items-center gap-0.5 hover:underline">
          View all <ChevronRight className="w-3 h-3" />
        </Link>
      </div>

      <div className="space-y-2">
        {upcoming.map((session) => (
          <div
            key={session.id}
            className="flex items-center gap-3 bg-card rounded-xl p-3 border border-border/50 shadow-sm"
          >
            <div className="w-10 h-10 rounded-lg bg-primary/5 flex flex-col items-center justify-center flex-shrink-0">
              <span className="text-[10px] text-primary font-medium leading-none">
                {session.session_date ? format(parseISO(session.session_date), 'MMM') : ''}
              </span>
              <span className="text-sm font-heading font-bold text-primary leading-none mt-0.5">
                {session.session_date ? format(parseISO(session.session_date), 'd') : ''}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{session.title}</p>
              <p className="text-xs text-muted-foreground">
                {session.subject} · {session.duration_minutes || 30} min
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}