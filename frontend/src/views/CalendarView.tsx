import { startOfWeek } from '../utils/date';
import type { AssessmentForm, StudySession } from '../types';

interface CalendarViewProps {
  weekSessions: StudySession[];
  assessments: AssessmentForm[];
  onAssessmentClick?: (assessment: AssessmentForm) => void;
}

export function CalendarView({ weekSessions, assessments, onAssessmentClick }: CalendarViewProps) {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();

  // Get first day of month and number of days
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const daysInMonth = lastDay.getDate();
  const startingDayOfWeek = firstDay.getDay();

  // Build calendar grid
  const weeks = [];
  let week = Array(startingDayOfWeek).fill(null);

  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month, day);
    const dateStr = date.toISOString().split('T')[0];

    const load = weekSessions.filter((s) => s.session_date === dateStr).length;
    const dayAssessments = assessments.filter((a) => a.due_date === dateStr);

    week.push({ day, date: dateStr, load, assessments: dayAssessments });

    if (week.length === 7) {
      weeks.push(week);
      week = [];
    }
  }

  if (week.length > 0) {
    week.push(...Array(7 - week.length).fill(null));
    weeks.push(week);
  }

  const monthName = firstDay.toLocaleString('default', { month: 'long', year: 'numeric' }).toUpperCase();
  const todayNum = today.getDate();

  return (
    <div className="pb-24">
      {/* Header */}
      <div className="px-4 py-6">
        <div className="flex items-end justify-between mb-6">
          <div>
            <p className="text-xs text-slate-500 font-mono font-bold uppercase mb-1 tracking-wide">{monthName}</p>
            <h1 className="text-3xl font-bold text-slate-900">Calendar</h1>
          </div>
          <button className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50">
            <svg className="w-5 h-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
            </svg>
          </button>
        </div>

        {/* Day headers */}
        <div className="grid grid-cols-7 gap-1 mb-3">
          {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, i) => (
            <div key={i} className="text-xs font-mono font-bold text-slate-500 text-center py-1">
              {day}
            </div>
          ))}
        </div>

        {/* Calendar grid */}
        <div className="bg-white rounded-2xl p-2 border border-slate-200 mb-6">
          {weeks.map((week, wi) => (
            <div key={wi} className="grid grid-cols-7 gap-1 mb-1">
              {week.map((day, di) => {
                if (!day) {
                  return <div key={di} className="aspect-square" />;
                }

                const isToday = day.day === todayNum;
                const height = Math.min(48, Math.max(6, (day.load || 0) * 8));

                return (
                  <div
                    key={di}
                    className={`aspect-square p-1 rounded-lg flex flex-col items-start justify-between ${
                      isToday ? 'bg-slate-900 text-white' : 'bg-transparent text-slate-900'
                    }`}
                  >
                    <span className={`text-xs font-mono font-semibold`}>{day.day}</span>
                    <div className="flex gap-0.5 w-full">
                      {Array.from({ length: Math.min(3, day.load || 0) }).map((_, i) => (
                        <div
                          key={i}
                          className={`flex-1 h-1 rounded-0.5 ${
                            isToday ? 'bg-lime-400' : 'bg-blue-500'
                          }`}
                          style={{ opacity: 0.4 + (i * 0.2) }}
                        />
                      ))}
                    </div>
                    {day.assessments.length > 0 && (
                      <div className="absolute bottom-1 right-1 w-2 h-2 rounded-full bg-rose-500" />
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Upcoming assessments */}
      <div className="px-4">
        <h2 className="text-xs font-mono font-bold text-slate-500 uppercase mb-3 tracking-wide">In view</h2>
        <div className="space-y-3">
          {assessments.slice(0, 3).map((a) => {
            const dueDate = new Date(a.due_date);
            const now = new Date();
            const daysLeft = Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
            const isUrgent = daysLeft <= 14;

            return (
              <div
                key={a.id}
                onClick={() => onAssessmentClick?.(a)}
                className="bg-white border border-slate-200 rounded-2xl p-4 cursor-pointer hover:border-slate-300 transition"
              >
                <div className="flex gap-3">
                  {/* Date badge */}
                  <div className="w-12 h-14 rounded-lg bg-blue-50 flex flex-col items-center justify-center flex-shrink-0">
                    <span className="text-xs font-mono opacity-70 font-bold">{dueDate.toLocaleString('default', { month: 'short' }).toUpperCase()}</span>
                    <span className="text-lg font-mono font-bold">{dueDate.getDate()}</span>
                  </div>
                  {/* Details */}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-mono font-bold text-blue-600 mb-1">{a.module_id}</p>
                    <p className="text-sm font-semibold text-slate-900 mb-2">{a.title}</p>
                    <div className="flex gap-2 items-center text-xs">
                      <span
                        className={`px-2 py-1 rounded-lg font-semibold ${
                          isUrgent ? 'bg-rose-100 text-rose-700' : 'bg-blue-100 text-blue-700'
                        }`}
                      >
                        {daysLeft}d left
                      </span>
                      <span className="text-slate-500 font-mono">{a.weight}% of grade</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
