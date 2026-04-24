import { useEffect, useState } from 'react';
import { Icon } from '../ui/Icon';
import { P, MONO, moduleColor } from '../ui/tokens';
import type { ModuleForm, StudySession } from '../types';

type Props = {
  session: StudySession;
  module?: ModuleForm;
  onClose: () => void;
  onComplete: () => Promise<void>;
};

export function TimerView({ session, module, onClose, onComplete }: Props) {
  const totalSec = session.planned_minutes * 60;
  const [remaining, setRemaining] = useState(totalSec);
  const [running, setRunning] = useState(true);

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setRemaining((r) => Math.max(0, r - 1)), 1000);
    return () => clearInterval(t);
  }, [running]);

  const mm = String(Math.floor(remaining / 60)).padStart(2, '0');
  const ss = String(remaining % 60).padStart(2, '0');
  const pct = 1 - remaining / totalSec;
  const c = moduleColor(session.module_id);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col"
      style={{ background: P.ink, color: P.surface }}
    >
      <div className="flex items-center justify-between px-5 pt-[62px]">
        <button
          onClick={onClose}
          className="-m-2 p-2 active:opacity-70"
          aria-label="Close"
        >
          <Icon name="close" size={24} color={P.surface} />
        </button>
        <div
          className="mono text-xs tracking-wider"
          style={{ color: 'rgba(255,255,255,0.5)', fontFamily: MONO }}
        >
          FOCUS MODE
        </div>
        <div className="w-6" />
      </div>

      <div className="flex flex-1 flex-col items-center justify-center px-5">
        <div className="mb-10 flex flex-col items-center gap-2">
          <div
            className="mono text-[12px] font-bold tracking-wider"
            style={{ color: c.solid, fontFamily: MONO }}
          >
            {session.module_id}
          </div>
          <div className="max-w-[260px] text-center text-[20px] font-semibold tracking-[-0.3px]">
            {module?.name ?? session.module_id}
          </div>
        </div>

        <div className="relative h-[280px] w-[280px]">
          <svg width={280} height={280} style={{ transform: 'rotate(-90deg)' }}>
            <circle cx={140} cy={140} r={130} stroke="rgba(255,255,255,0.08)" strokeWidth={6} fill="none" />
            <circle
              cx={140}
              cy={140}
              r={130}
              stroke={P.lime}
              strokeWidth={6}
              fill="none"
              strokeLinecap="round"
              strokeDasharray={2 * Math.PI * 130}
              strokeDashoffset={2 * Math.PI * 130 * (1 - pct)}
              style={{ transition: 'stroke-dashoffset 1s linear' }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <div
              className="mono font-medium leading-none text-white"
              style={{ fontFamily: MONO, fontSize: 72, letterSpacing: '-4px' }}
            >
              {mm}:{ss}
            </div>
            <div
              className="mono mt-2 text-xs tracking-wider"
              style={{ color: 'rgba(255,255,255,0.5)', fontFamily: MONO }}
            >
              of {session.planned_minutes}:00
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-center gap-4 px-6 pb-11 pt-2">
        <CircleBtn onClick={() => setRemaining(totalSec)}>
          <Icon name="refresh" size={20} color={P.surface} />
        </CircleBtn>
        <button
          onClick={() => setRunning(!running)}
          className="flex h-[84px] w-[84px] items-center justify-center rounded-full transition-transform active:scale-95"
          style={{ background: P.lime, color: P.limeInk }}
          aria-label={running ? 'Pause' : 'Resume'}
        >
          <Icon name={running ? 'pause' : 'play'} size={32} color={P.limeInk} />
        </button>
        <CircleBtn onClick={onComplete}>
          <Icon name="check" size={20} color={P.surface} />
        </CircleBtn>
      </div>
    </div>
  );
}

function CircleBtn({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex h-14 w-14 items-center justify-center rounded-full transition-transform active:scale-95"
      style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.15)' }}
    >
      {children}
    </button>
  );
}
