import { useState } from 'react';
import { Icon } from '../ui/Icon';
import { P, MONO, moduleColor } from '../ui/tokens';
const DEFAULT_WINDOWS = {
    morning: true,
    lunch: false,
    evening: true,
    weekend: true,
};
export function LandingView({ onDone }) {
    const [step, setStep] = useState(0);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [weekly, setWeekly] = useState(12);
    const [windows, setWindows] = useState(DEFAULT_WINDOWS);
    const [modules, setModules] = useState([]);
    const finish = async () => {
        setLoading(true);
        setError(null);
        try {
            await onDone({ weeklyHours: weekly, windows, modules });
        }
        catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to finish onboarding');
        }
        finally {
            setLoading(false);
        }
    };
    if (step === 0) {
        return <IntroStep onContinue={() => setStep(1)}/>;
    }
    return (<div className="mx-auto flex min-h-screen w-full max-w-[440px] flex-col" style={{ background: P.bg }}>
      <div className="flex gap-[6px] px-6 pt-[62px]">
        {[1, 2, 3].map((i) => (<div key={i} className="h-1 flex-1 rounded-full" style={{ background: i <= step ? P.ink : P.line }}/>))}
      </div>

      <div className="px-6 pt-6">
        <button onClick={() => setStep((s) => Math.max(0, s - 1))} className="flex items-center gap-1 text-[13px] text-ink2">
          <Icon name="arrowLeft" size={14}/> Back
        </button>
      </div>

      {step === 1 && (<StepHours weekly={weekly} onChange={setWeekly} onNext={() => setStep(2)}/>)}
      {step === 2 && (<StepWindows windows={windows} onChange={setWindows} onNext={() => setStep(3)}/>)}
      {step === 3 && (<StepModules modules={modules} onChange={setModules} loading={loading} error={error} onFinish={finish}/>)}
    </div>);
}
function IntroStep({ onContinue }) {
    const cards = [
        { label: 'Mon · Read · 45m', bg: P.primary, fg: '#fff', rot: -4 },
        { label: 'Tue · Practice · 60m', bg: P.lime, fg: P.limeInk, rot: 3 },
        { label: 'Wed · Review · 30m', bg: P.coral, fg: '#fff', rot: -2 },
    ];
    return (<div className="flex min-h-screen flex-col px-6 pb-8 pt-[70px]" style={{ background: P.bg }}>
      <div className="relative mb-2 h-[220px]">
        {cards.map((c, i) => (<div key={i} className="absolute flex h-[60px] items-center rounded-2xl px-4 text-sm font-semibold" style={{
                top: i * 60 + 10,
                left: i === 1 ? 'auto' : 20 + i * 20,
                right: i === 1 ? 10 : 'auto',
                width: 170 + i * 20,
                background: c.bg,
                color: c.fg,
                transform: `rotate(${c.rot}deg)`,
            }}>
            <span className="flex-1">{c.label}</span>
          </div>))}
      </div>
      <div className="mt-auto">
        <h1 className="text-[38px] font-bold leading-[1.05] tracking-tightest text-ink">
          A weekly plan,<br />built around your life.
        </h1>
        <p className="mt-4 text-[16px] leading-relaxed text-ink2">
          StudyPartner reads your module content, deadlines, and the hours you can spare — then drops study into the right slots.
        </p>
      </div>
      <button onClick={onContinue} className="btn-primary mt-8 w-full">
        Let's set it up <Icon name="arrowRight" size={18} color="#fff"/>
      </button>
    </div>);
}
function StepHours({ weekly, onChange, onNext, }) {
    return (<StepShell title="How much study time, each week?" sub="We'll never overbook. You can change this later." onNext={onNext} nextLabel="Continue">
      <div className="py-3 text-center">
        <div className="mono font-semibold leading-none text-ink" style={{ fontSize: 88, letterSpacing: '-4px', fontFamily: MONO }}>
          {weekly}
          <span className="ml-2 text-[28px] text-ink3">h</span>
        </div>
        <div className="mt-1.5 text-sm text-ink3">
          about {(weekly / 7).toFixed(1)} hours a day
        </div>
      </div>
      <input type="range" min={4} max={30} value={weekly} onChange={(e) => onChange(Number(e.target.value))} className="mt-5 w-full" style={{ accentColor: P.primary }}/>
      <div className="mt-1.5 flex justify-between text-xs text-ink3 mono">
        <span>4h</span>
        <span>30h</span>
      </div>
      <div className="mt-6 flex gap-2.5 rounded-2xl p-3.5" style={{ background: P.primarySoft }}>
        <Icon name="lightbulb" size={18} color={P.primary}/>
        <p className="text-[13px] leading-relaxed text-ink">
          Most busy adults pick{' '}
          <b>{weekly < 10 ? '8–12h' : weekly < 18 ? '12–15h' : '15–20h'}</b>. We split across
          your modules based on deadlines.
        </p>
      </div>
    </StepShell>);
}
function StepWindows({ windows, onChange, onNext, }) {
    const OPTIONS = [
        { id: 'morning', label: 'Before work', sub: '6:00 – 8:30', color: P.amber },
        { id: 'lunch', label: 'Lunch break', sub: '12:00 – 13:30', color: P.lime },
        { id: 'evening', label: 'After work', sub: '18:00 – 21:00', color: P.primary },
        { id: 'weekend', label: 'Weekend mornings', sub: 'Sat & Sun', color: P.coral },
    ];
    return (<StepShell title="When can you study?" sub="Tap the windows that usually work. We'll schedule within them." onNext={onNext} nextLabel="Continue" disabled={!Object.values(windows).some(Boolean)}>
      <div className="mt-4 flex flex-col gap-2.5">
        {OPTIONS.map((w) => {
            const on = windows[w.id];
            return (<button key={w.id} onClick={() => onChange({ ...windows, [w.id]: !on })} className="flex items-center gap-3.5 rounded-2xl px-4 py-3.5 text-left transition-colors" style={{
                    border: `1.5px solid ${on ? P.ink : P.line}`,
                    background: on ? P.surface : 'transparent',
                }}>
              <div className="h-9 w-2.5 rounded" style={{ background: on ? w.color : P.line }}/>
              <div className="flex-1">
                <div className="text-[15px] font-semibold text-ink">{w.label}</div>
                <div className="mono mt-0.5 text-xs text-ink3" style={{ fontFamily: MONO }}>
                  {w.sub}
                </div>
              </div>
              <div className="flex h-6 w-6 items-center justify-center rounded-full" style={{
                    background: on ? P.ink : 'transparent',
                    border: `1.5px solid ${on ? P.ink : P.ink3}`,
                }}>
                {on && <Icon name="check" size={14} color={P.surface} strokeWidth={2.5}/>}
              </div>
            </button>);
        })}
      </div>
    </StepShell>);
}
function StepModules({ modules, onChange, loading, error, onFinish, }) {
    const [draftId, setDraftId] = useState('');
    const [draftName, setDraftName] = useState('');
    const [draftType, setDraftType] = useState('semester');
    const add = () => {
        if (!draftId || !draftName)
            return;
        onChange([...modules, { id: draftId, name: draftName, module_type: draftType }]);
        setDraftId('');
        setDraftName('');
    };
    return (<StepShell title="Your modules this term" sub="We'll weight time based on deadlines and credit." onNext={onFinish} nextLabel="Generate my first week →" disabled={modules.length === 0 || loading}>
      <div className="mt-2.5 flex flex-col gap-2.5">
        {modules.map((m) => {
            const c = moduleColor(m.id);
            return (<div key={m.id} className="flex items-center gap-3 rounded-[14px] border border-line bg-surface px-3.5 py-3">
              <div className="mono flex h-[42px] w-[42px] items-center justify-center rounded-[10px] text-[11px] font-bold" style={{ background: c.bg, color: c.fg, fontFamily: MONO }}>
                {m.id.slice(0, 3).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-ink">{m.name}</div>
                <div className="mono mt-0.5 text-xs text-ink3" style={{ fontFamily: MONO }}>
                  {m.id} · {m.module_type}
                </div>
              </div>
            </div>);
        })}

        <div className="rounded-[14px] border border-dashed border-line bg-transparent p-3">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-ink3">
            Add a module
          </div>
          <input className="input mb-2" placeholder="Code (e.g. BUS3040)" value={draftId} onChange={(e) => setDraftId(e.target.value)}/>
          <input className="input mb-2" placeholder="Name" value={draftName} onChange={(e) => setDraftName(e.target.value)}/>
          <select className="input mb-2" value={draftType} onChange={(e) => setDraftType(e.target.value)}>
            <option value="semester">Semester</option>
            <option value="year">Year</option>
          </select>
          <button className="btn-secondary w-full" disabled={!draftId || !draftName} onClick={add}>
            <Icon name="plus" size={14}/> Add
          </button>
        </div>
        {error && (<div className="rounded-[12px] px-3 py-2 text-sm" style={{ background: P.coralSoft, color: P.coralDeep }}>
            {error}
          </div>)}
      </div>
    </StepShell>);
}
function StepShell({ title, sub, children, onNext, nextLabel, disabled, }) {
    return (<div className="flex flex-1 flex-col">
      <div className="px-6 pt-3">
        <h2 className="text-[26px] font-bold leading-tight tracking-tightest text-ink">
          {title}
        </h2>
        {sub && <p className="mt-2 text-sm leading-relaxed text-ink2">{sub}</p>}
      </div>
      <div className="flex-1 overflow-y-auto px-6 pt-2">{children}</div>
      <div className="px-6 pb-8 pt-4">
        <button disabled={disabled} onClick={onNext} className="btn-primary w-full">
          {nextLabel}
          <Icon name="arrowRight" size={18} color="#fff"/>
        </button>
      </div>
    </div>);
}
