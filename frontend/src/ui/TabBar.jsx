import { P } from './tokens';
import { Icon } from './Icon';
const TABS = [
    { id: 'home', label: 'Home', icon: 'home' },
    { id: 'today', label: 'Today', icon: 'today' },
    { id: 'week', label: 'Week', icon: 'week' },
    { id: 'calendar', label: 'Cal', icon: 'calendar' },
    { id: 'modules', label: 'Modules', icon: 'modules' },
];
export function TabBar({ active, onChange, }) {
    return (<div className="fixed bottom-0 left-1/2 z-40 w-full max-w-[440px] -translate-x-1/2 px-3 pt-[10px] pb-[26px]" style={{ background: `linear-gradient(to top, ${P.bg} 55%, ${P.bg}00)` }}>
      <div className="flex rounded-card p-[6px] shadow-pill" style={{ background: P.surface, border: `1px solid ${P.line}` }}>
        {TABS.map((t) => {
            const on = active === t.id;
            return (<button key={t.id} onClick={() => onChange(t.id)} className="flex flex-1 flex-col items-center gap-[3px] rounded-[16px] py-[10px] transition-colors" style={{
                    background: on ? P.ink : 'transparent',
                    color: on ? P.surface : P.ink3,
                }}>
              <Icon name={t.icon} size={19} color={on ? P.surface : P.ink3}/>
              <span className="text-[10px] font-semibold tracking-[0.2px]">{t.label}</span>
            </button>);
        })}
      </div>
    </div>);
}
