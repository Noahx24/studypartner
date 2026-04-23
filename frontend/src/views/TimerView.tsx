import { useEffect, useState } from 'react';
import type { StudySession } from '../types';

interface TimerViewProps {
  session: StudySession | null;
  module?: { name: string; id: string };
  onClose: () => void;
  onComplete: (sessionId: string) => void;
}

export function TimerView({ session, module, onClose, onComplete }: TimerViewProps) {
  const [remaining, setRemaining] = useState<number>(0);
  const [running, setRunning] = useState(true);

  useEffect(() => {
    if (!session) return;
    // Start at mid-session for demo (can be parameterized)
    setRemaining(Math.max(0, session.planned_minutes * 60 - 640));
  }, [session]);

  useEffect(() => {
    if (!running || remaining <= 0) return;
    const timer = setInterval(() => setRemaining((r) => Math.max(0, r - 1)), 1000);
    return () => clearInterval(timer);
  }, [running, remaining]);

  if (!session) return null;

  const totalSec = session.planned_minutes * 60;
  const mm = String(Math.floor(remaining / 60)).padStart(2, '0');
  const ss = String(remaining % 60).padStart(2, '0');
  const pct = 1 - remaining / totalSec;

  // Calculate ring progress
  const radius = 130;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (1 - pct);

  return (
    <div className="fixed inset-0 flex flex-col bg-slate-900 text-white">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-6">
        <button onClick={onClose} className="p-2 hover:bg-slate-800 rounded-lg">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        <div className="text-xs tracking-wide opacity-50 font-mono">FOCUS · {session?.unit_id.toUpperCase()}</div>
        <div className="w-6" />
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col items-center justify-center px-4">
        {/* Module badge */}
        <div className="mb-12 text-center">
          <div className="text-xs font-mono font-bold opacity-60 tracking-wide mb-2">{module?.id || 'Module'}</div>
          <div className="text-xl font-semibold max-w-xs">{module?.name || session.unit_id}</div>
        </div>

        {/* Big ring timer */}
        <div className="relative w-72 h-72">
          <svg width="280" height="280" className="transform -rotate-90">
            <circle cx="140" cy="140" r={radius} stroke="rgba(255,255,255,0.08)" strokeWidth="6" fill="none" />
            <circle
              cx="140"
              cy="140"
              r={radius}
              stroke="#D8F26A"
              strokeWidth="6"
              fill="none"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              style={{ transition: 'stroke-dashoffset 1s linear' }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <div className="font-mono text-6xl font-medium tracking-tighter">
              {mm}:{ss}
            </div>
            <div className="text-xs opacity-50 font-mono mt-2">of {session.planned_minutes}:00</div>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="flex gap-3 items-center justify-center px-4 pb-12">
        <button className="w-14 h-14 rounded-full border border-white border-opacity-15 hover:bg-white hover:bg-opacity-10 flex items-center justify-center">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
        <button
          onClick={() => setRunning(!running)}
          className="w-20 h-20 rounded-full bg-lime-400 text-slate-900 flex items-center justify-center hover:bg-lime-300"
        >
          {running ? (
            <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24">
              <rect x="6" y="4" width="4" height="16" rx="1" />
              <rect x="14" y="4" width="4" height="16" rx="1" />
            </svg>
          ) : (
            <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>
        <button
          onClick={() => onComplete(session.id)}
          className="w-14 h-14 rounded-full border border-white border-opacity-15 hover:bg-white hover:bg-opacity-10 flex items-center justify-center"
        >
          <svg className="w-5 h-5 text-lime-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
          </svg>
        </button>
      </div>
    </div>
  );
}
