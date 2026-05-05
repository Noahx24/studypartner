import { P, MONO, toneColors } from './tokens';
import { Icon } from './Icon';
// ─── Screen shell ─────────────────────────────────────────────────────
export function Screen({ children }) {
    return <div className="min-h-full pb-28">{children}</div>;
}
export function ScreenHeader({ title, subtitle, right, compact = false, }) {
    return (<div className="sticky top-0 z-10 bg-app" style={{ padding: compact ? '16px 20px 8px' : '58px 20px 14px' }}>
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0 flex-1">
          {subtitle && (<div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink3 mono">
              {subtitle}
            </div>)}
          <h1 className="text-[30px] font-bold leading-[1.05] tracking-tightest text-ink">
            {title}
          </h1>
        </div>
        {right}
      </div>
    </div>);
}
// ─── Card ──────────────────────────────────────────────────────────────
export function Card({ children, onClick, className = '', pad = 18, style, variant = 'surface', }) {
    const base = 'rounded-card transition-transform active:scale-[0.995]';
    const variantStyles = {
        surface: { background: P.surface, border: `1px solid ${P.line}` },
        dark: { background: P.ink, color: P.surface, border: 'none' },
        tinted: { border: 'none' },
    };
    return (<div onClick={onClick} className={`${base} ${className} ${onClick ? 'cursor-pointer' : ''}`} style={{ padding: pad, ...variantStyles[variant], ...style }}>
      {children}
    </div>);
}
// ─── Chip & Dot ───────────────────────────────────────────────────────
export function Chip({ children, tone = 'muted', leadingIcon, style, }) {
    const { bg, fg } = toneColors(tone);
    return (<span className="chip" style={{ background: bg, color: fg, ...style }}>
      {leadingIcon && <Icon name={leadingIcon} size={11} color={fg} strokeWidth={2}/>}
      {children}
    </span>);
}
export function Dot({ color, size = 8 }) {
    return (<span className="inline-block rounded-full" style={{ width: size, height: size, background: color }}/>);
}
// ─── Buttons ──────────────────────────────────────────────────────────
export function IconBtn({ children, onClick, size = 42, tone = 'surface', 'aria-label': ariaLabel, }) {
    const palette = {
        surface: { background: P.surface, color: P.ink, border: `1px solid ${P.line}` },
        dark: { background: P.ink, color: P.surface, border: 'none' },
        lime: { background: P.lime, color: P.limeInk, border: 'none' },
    };
    return (<button aria-label={ariaLabel} onClick={onClick} className="flex shrink-0 items-center justify-center transition-transform active:scale-95" style={{
            width: size,
            height: size,
            borderRadius: size / 2,
            ...palette[tone],
        }}>
      {children}
    </button>);
}
// ─── Progress ring ────────────────────────────────────────────────────
export function ProgressRing({ value, size = 44, stroke = 4, color = P.primary, trackColor = P.line, children, }) {
    const r = (size - stroke) / 2;
    const c = 2 * Math.PI * r;
    const clamped = Math.max(0, Math.min(1, value));
    return (<div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={r} stroke={trackColor} strokeWidth={stroke} fill="none"/>
        <circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={stroke} fill="none" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - clamped)} transform={`rotate(-90 ${size / 2} ${size / 2})`} style={{ transition: 'stroke-dashoffset 0.6s cubic-bezier(.2,.8,.2,1)' }}/>
      </svg>
      {children && <div className="absolute">{children}</div>}
    </div>);
}
// ─── Section label ────────────────────────────────────────────────────
export function SectionLabel({ title, action, onAction, }) {
    return (<div className="flex items-baseline justify-between px-1 pb-3 pt-6">
      <div className="text-[12px] font-bold uppercase tracking-[0.5px] text-ink3">{title}</div>
      {action && (<button onClick={onAction} className="text-[13px] font-semibold text-primary active:opacity-70" style={{ color: P.primary, fontFamily: 'inherit' }}>
          {action}
        </button>)}
    </div>);
}
// ─── Sync pill ────────────────────────────────────────────────────────
export function SyncPill({ state, onClick, }) {
    let tone = 'muted';
    let label = 'Synced';
    let leading = 'cloud';
    if (state === 'offline') {
        tone = 'warn';
        label = 'Offline';
    }
    else if (state === 'syncing') {
        tone = 'primary';
        label = 'Syncing';
        leading = 'refresh';
    }
    else if (typeof state === 'object') {
        tone = 'primary';
        label = `${state.queued} queued`;
    }
    return (<button onClick={onClick} className="active:opacity-70">
      <Chip tone={tone} leadingIcon={leading}>
        {label}
      </Chip>
    </button>);
}
// ─── Monospace stat cell ──────────────────────────────────────────────
export function StatCell({ label, value, accent, }) {
    return (<div>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-ink3">{label}</div>
      <div className="mono mt-0.5 text-[16px] font-bold text-ink" style={{ fontFamily: MONO, letterSpacing: '-0.5px', color: accent ?? P.ink }}>
        {value}
      </div>
    </div>);
}
// ─── Empty state ──────────────────────────────────────────────────────
export function EmptyState({ icon, title, body, action, }) {
    return (<div className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
      {icon && (<div className="flex h-14 w-14 items-center justify-center rounded-full" style={{ background: P.primarySoft, color: P.primary }}>
          <Icon name={icon} size={24} color={P.primary}/>
        </div>)}
      <div className="text-[17px] font-semibold text-ink">{title}</div>
      {body && <div className="max-w-[260px] text-[14px] leading-relaxed text-ink2">{body}</div>}
      {action}
    </div>);
}
