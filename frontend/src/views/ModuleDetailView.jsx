import { Card, Chip, SectionLabel, StatCell } from '../ui/primitives';
import { Icon } from '../ui/Icon';
import { P, MONO, moduleColor } from '../ui/tokens';
export function ModuleDetailView({ module, detail, assessments, onBack, onPlan, onPacks, onUpload, }) {
    if (!module) {
        return (<div className="p-6 text-center text-sm text-ink2">Module not found.</div>);
    }
    const c = moduleColor(module.id);
    const topics = detail?.content?.topics ?? [];
    const nextAssess = [...assessments].sort((a, b) => a.due_date.localeCompare(b.due_date))[0];
    return (<div className="min-h-full pb-28">
      <div className="sticky top-0 z-10 px-5 pb-3 pt-[54px]" style={{ background: P.bg }}>
        <button onClick={onBack} className="flex items-center gap-1 pb-3.5 text-[13px] text-ink2">
          <Icon name="arrowLeft" size={14}/> Modules
        </button>
      </div>

      <div className="px-4">
        {/* Hero */}
        <Card variant="tinted" pad={0} style={{ background: c.bg, marginBottom: 14 }}>
          <div className="px-5 pb-5 pt-[18px]">
            <div className="flex items-center justify-between">
              <div className="mono text-xs font-bold tracking-wider" style={{ color: c.fg, fontFamily: MONO }}>
                {module.id}
              </div>
              <Chip tone="ok">On track</Chip>
            </div>
            <h1 className="mt-2 text-[24px] font-bold leading-tight tracking-[-0.5px] text-ink">
              {module.name}
            </h1>

            <div className="mt-4 grid grid-cols-3 gap-2">
              <HeroStat label="Topics" value={String(topics.length)}/>
              <HeroStat label="Time" value={detail ? `${Math.round(detail.totalMinutes / 60)}h` : '—'}/>
              <HeroStat label="Next" value={nextAssess ? nextAssess.title.split(' ')[0] : '—'}/>
            </div>
          </div>
        </Card>

        {/* Primary action */}
        <button onClick={onPlan} className="btn-primary w-full">
          <Icon name="sparkles" size={16} color="#fff"/> Plan a study pack
        </button>

        <div className="mt-3 grid grid-cols-2 gap-3">
          <button onClick={onPacks} className="btn-secondary w-full">
            <Icon name="pack" size={14}/> Past packs
          </button>
          <button onClick={onUpload} className="btn-secondary w-full">
            <Icon name="plus" size={14}/> Upload
          </button>
        </div>

        <SectionLabel title="Topics"/>
        {topics.length === 0 ? (<Card>
            <p className="text-sm text-ink3">
              No topics yet. Upload material to generate them.
            </p>
          </Card>) : (<div className="flex flex-col gap-2">
            {topics.map((t, i) => (<div key={t.id} className="flex items-center gap-3 rounded-[14px] border border-line bg-surface px-3.5 py-3">
                <div className="mono w-6 text-[11px] font-bold text-ink3" style={{ fontFamily: MONO }}>
                  {String(i + 1).padStart(2, '0')}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14px] font-medium text-ink">
                    {t.title}
                  </div>
                  <div className="mono mt-0.5 text-[11px] text-ink3" style={{ fontFamily: MONO }}>
                    {t.word_count.toLocaleString()} words
                    {t.page_span ? ` · ${t.page_span}p` : ''}
                  </div>
                </div>
              </div>))}
          </div>)}

        <SectionLabel title="Deadlines"/>
        {assessments.length === 0 ? (<Card>
            <p className="text-sm text-ink3">No deadlines for this module.</p>
          </Card>) : (<div className="flex flex-col gap-2.5">
            {assessments.map((a) => {
                const due = new Date(a.due_date);
                const days = Math.ceil((due.getTime() - Date.now()) / 86400000);
                return (<Card key={a.id} pad={14}>
                  <div className="flex items-center gap-3">
                    <div className="flex h-[50px] w-12 shrink-0 flex-col items-center justify-center rounded-[10px]" style={{ background: c.bg, color: c.fg }}>
                      <div className="mono text-[10px] font-bold opacity-70" style={{ fontFamily: MONO }}>
                        {due
                        .toLocaleString('en-US', { month: 'short' })
                        .toUpperCase()}
                      </div>
                      <div className="mono text-[20px] font-extrabold leading-none" style={{ fontFamily: MONO }}>
                        {due.getDate()}
                      </div>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-ink">{a.title}</div>
                      <div className="mt-1.5 flex items-center gap-2">
                        <Chip tone={days <= 14 ? 'risk' : 'primary'} leadingIcon="clock">
                          {days}d left
                        </Chip>
                        <span className="mono text-xs text-ink3" style={{ fontFamily: MONO }}>
                          {Math.round(a.weight)}% of grade
                        </span>
                      </div>
                    </div>
                  </div>
                </Card>);
            })}
          </div>)}
      </div>
    </div>);
}
function HeroStat({ label, value }) {
    return (<div className="rounded-[12px] px-3 py-2.5" style={{ background: 'rgba(255,255,255,0.55)' }}>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-ink2">
        {label}
      </div>
      <div className="mono mt-0.5 text-[18px] font-bold tracking-[-0.5px] text-ink" style={{ fontFamily: MONO }}>
        {value}
      </div>
    </div>);
}
// Kept for potential reuse; silence unused-import linter in this tree.
export { StatCell };
