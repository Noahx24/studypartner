import React from 'react';
import { format } from 'date-fns';
import { Flame, Target } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';

const MOTIVATIONAL = [
  "Every session counts. Keep going.",
  "Small steps, big results.",
  "You showed up — that's already a win.",
  "Consistency beats intensity. Stay steady.",
  "Your future self will thank you.",
  "One session at a time.",
  "Progress, not perfection.",
  "The best time to study is now.",
  "Deadlines wait for no one — but you've got this.",
  "Focus for 30 minutes. You can do anything for 30 minutes.",
];

function getMotivation(streak) {
  if (streak >= 7) return "🔥 A whole week streak — you're unstoppable!";
  if (streak >= 3) return "⚡ On a roll! Keep the streak alive.";
  const h = new Date().getHours();
  if (h < 10) return "🌅 Morning study session — great start to the day.";
  if (h >= 21) return "🌙 Late-night grind. You're dedicated.";
  return MOTIVATIONAL[new Date().getDate() % MOTIVATIONAL.length];
}

export default function TodayHeader({ sessionsToday, completedToday, streak }) {
  const today = new Date();
  const progress = sessionsToday > 0 ? Math.round((completedToday / sessionsToday) * 100) : 0;
  const motivation = getMotivation(streak);

  const { user } = useAuth();

  // "NOAH ANELISIWE KWEZI MBUDE" → "Noah": first name only, title-cased,
  // so the greeting reads like a person wrote it.
  const rawFirst = user?.name?.trim().split(/\s+/)[0];
  const firstName = rawFirst
    ? rawFirst.charAt(0).toUpperCase() + rawFirst.slice(1).toLowerCase()
    : 'there';
  const hour = today.getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  // Status pill, design-style: quick glance "am I okay today?"
  const onTrack =
    sessionsToday === 0 || completedToday >= sessionsToday / 2;
  const headline =
    sessionsToday === 0
      ? null
      : completedToday === sessionsToday
        ? 'All done for today'
        : completedToday >= sessionsToday / 2
          ? 'Halfway there'
          : completedToday > 0
            ? 'Good start'
            : 'Ready when you are';

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between">
        <p className="text-xs font-mono font-semibold text-muted-foreground uppercase tracking-widest">
          {format(today, 'EEEE · d MMMM').toUpperCase()}
        </p>
        {sessionsToday > 0 && (
          <span
            className={
              onTrack
                ? 'text-xs font-semibold px-3 py-1 rounded-full bg-emerald-100 text-emerald-700'
                : 'text-xs font-semibold px-3 py-1 rounded-full bg-amber-100 text-amber-700'
            }
          >
            {onTrack ? '● On track' : '● Catch up'}
          </span>
        )}
      </div>
      <h1 className="font-heading text-3xl font-bold mt-1 tracking-tight">
        {greeting},<br />{firstName}
      </h1>

      <div className="flex gap-3 mt-4">
        {/* Progress Ring */}
        <div className="flex-1 bg-card rounded-2xl p-4 border border-border/60 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="relative w-12 h-12 flex-shrink-0">
              <svg className="w-12 h-12 -rotate-90" viewBox="0 0 36 36">
                <path
                  d="M18 2.0845a 15.9155 15.9155 0 0 1 0 31.831a 15.9155 15.9155 0 0 1 0 -31.831"
                  fill="none" stroke="hsl(var(--muted))" strokeWidth="3"
                />
                <path
                  d="M18 2.0845a 15.9155 15.9155 0 0 1 0 31.831a 15.9155 15.9155 0 0 1 0 -31.831"
                  fill="none" stroke="hsl(var(--primary))" strokeWidth="3"
                  strokeDasharray={`${progress}, 100`} strokeLinecap="round"
                  className="transition-all duration-700"
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <Target className="w-4 h-4 text-primary" />
              </div>
            </div>
            <div>
              {headline && (
                <p className="font-heading font-bold text-sm tracking-tight">{headline}</p>
              )}
              <p className="text-xs text-muted-foreground mt-0.5">
                {completedToday} of {sessionsToday} sessions done
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">{motivation}</p>
            </div>
          </div>
        </div>

        {/* Streak */}
        <div className="bg-accent/20 rounded-2xl p-4 border border-accent/30 shadow-sm flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-accent flex items-center justify-center flex-shrink-0">
            <Flame className="w-5 h-5 text-accent-foreground" />
          </div>
          <div>
            <p className="text-2xl font-heading font-bold font-mono tracking-tight">{streak}</p>
            <p className="text-xs text-muted-foreground">day streak</p>
          </div>
        </div>
      </div>
    </div>
  );
}