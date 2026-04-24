import { useMemo, useState } from 'react';
import { Card, Chip, IconBtn, Screen, ScreenHeader, SectionLabel } from '../ui/primitives';
import { Icon } from '../ui/Icon';
import { P, MONO, moduleColor } from '../ui/tokens';
import type { AssessmentForm, ModuleForm } from '../types';

type Props = {
  modules: ModuleForm[];
  assessments: AssessmentForm[];
  onBack: () => void;
  onAdd: (a: AssessmentForm) => Promise<void>;
};

export function AssessmentsView({ modules, assessments, onBack, onAdd }: Props) {
  const [adding, setAdding] = useState(false);

  const sorted = useMemo(
    () => [...assessments].sort((a, b) => a.due_date.localeCompare(b.due_date)),
    [assessments],
  );

  const totalWeight = sorted.reduce((a, x) => a + x.weight, 0);
  const within30 = sorted.filter((a) => {
    const d = (new Date(a.due_date).getTime() - Date.now()) / 86400000;
    return d >= 0 && d <= 30;
  });

  return (
    <Screen>
      <ScreenHeader
        subtitle={`${sorted.length} UPCOMING`}
        title="Assessments"
        right={
          <IconBtn onClick={() => setAdding(true)} aria-label="Add">
            <Icon name="plus" size={18} />
          </IconBtn>
        }
      />

      <div className="px-4">
        <Card variant="dark" pad={0} style={{ marginBottom: 14 }}>
          <div className="p-[18px]">
            <div
              className="mono text-[11px] font-bold tracking-wider"
              style={{ color: 'rgba(255,255,255,0.5)', fontFamily: MONO }}
            >
              NEXT 30 DAYS
            </div>
            <div className="mt-1 text-[24px] font-bold">
              {within30.length} pieces · {Math.round(totalWeight)}% of grade
            </div>

            <div className="relative mt-5 h-[70px]">
              <div
                className="absolute left-0 right-0 top-9 h-px"
                style={{ background: 'rgba(255,255,255,0.15)' }}
              />
              <div
                className="absolute top-[26px] h-5 w-[2px] rounded"
                style={{ background: P.lime, left: '2%' }}
              />
              <div
                className="mono absolute top-[50px] text-[10px]"
                style={{ color: P.lime, left: '2%', transform: 'translateX(-50%)', fontFamily: MONO }}
              >
                NOW
              </div>
              {within30.slice(0, 6).map((a) => {
                const daysLeft = Math.max(
                  0,
                  Math.ceil((new Date(a.due_date).getTime() - Date.now()) / 86400000),
                );
                const pos = Math.min(95, (daysLeft / 32) * 100);
                const c = moduleColor(a.module_id);
                return (
                  <div
                    key={a.id}
                    className="absolute top-5"
                    style={{ left: `${pos}%`, transform: 'translateX(-50%)' }}
                  >
                    <div
                      className="mono flex h-[34px] w-[34px] items-center justify-center rounded-full text-[10px] font-bold text-white"
                      style={{
                        background: c.solid,
                        border: `2px solid ${P.ink}`,
                        fontFamily: MONO,
                      }}
                    >
                      {Math.round(a.weight)}%
                    </div>
                    <div
                      className="mono mt-1 whitespace-nowrap text-center text-[10px]"
                      style={{
                        color: 'rgba(255,255,255,0.7)',
                        fontFamily: MONO,
                      }}
                    >
                      {new Date(a.due_date).getDate()}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </Card>

        {sorted.length === 0 ? (
          <Card>
            <p className="text-sm text-ink2">No deadlines yet.</p>
            <button onClick={() => setAdding(true)} className="btn-primary mt-3 w-full">
              <Icon name="plus" size={16} color="#fff" /> Add assessment
            </button>
          </Card>
        ) : (
          <div className="flex flex-col gap-2.5">
            {sorted.map((a) => {
              const m = modules.find((x) => x.id === a.module_id);
              return <AssessmentRow key={a.id} a={a} moduleName={m?.name ?? a.module_id} />;
            })}
          </div>
        )}

        <SectionLabel title="" />
        <button onClick={onBack} className="btn-secondary w-full">
          <Icon name="arrowLeft" size={14} /> Back to calendar
        </button>
      </div>

      {adding && (
        <AddAssessmentSheet
          modules={modules}
          onClose={() => setAdding(false)}
          onSubmit={async (a) => {
            await onAdd(a);
            setAdding(false);
          }}
        />
      )}
    </Screen>
  );
}

function AssessmentRow({ a, moduleName }: { a: AssessmentForm; moduleName: string }) {
  const c = moduleColor(a.module_id);
  const due = new Date(a.due_date);
  const days = Math.ceil((due.getTime() - Date.now()) / 86400000);
  return (
    <Card pad={16}>
      <div className="flex items-center gap-3">
        <div
          className="flex h-[62px] w-[54px] shrink-0 flex-col items-center justify-center rounded-[12px]"
          style={{ background: c.bg, color: c.fg }}
        >
          <div className="mono text-[10px] font-bold opacity-70" style={{ fontFamily: MONO }}>
            {due.toLocaleString('en-US', { month: 'short' }).toUpperCase()}
          </div>
          <div
            className="mono text-[22px] font-extrabold leading-none"
            style={{ fontFamily: MONO }}
          >
            {due.getDate()}
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <div
            className="mono text-[11px] font-bold tracking-wider"
            style={{ color: c.fg, fontFamily: MONO }}
          >
            {a.module_id}
          </div>
          <div className="mt-0.5 text-[15px] font-semibold text-ink">{a.title}</div>
          <div className="mt-2 flex items-center gap-2">
            <Chip
              tone={days <= 7 ? 'risk' : days <= 14 ? 'warn' : 'ok'}
              leadingIcon="clock"
            >
              {days <= 0 ? 'Overdue' : `${days}d left`}
            </Chip>
            <span className="mono text-xs text-ink3" style={{ fontFamily: MONO }}>
              {Math.round(a.weight)}% · {moduleName.split(' ')[0]}
            </span>
          </div>
        </div>
      </div>
    </Card>
  );
}

function AddAssessmentSheet({
  modules,
  onClose,
  onSubmit,
}: {
  modules: ModuleForm[];
  onClose: () => void;
  onSubmit: (a: AssessmentForm) => Promise<void>;
}) {
  const [form, setForm] = useState<AssessmentForm>({
    id: `a-${Date.now()}`,
    module_id: modules[0]?.id ?? '',
    title: '',
    due_date: '',
    weight: 30,
  });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!form.module_id || !form.title || !form.due_date) return;
    setSaving(true);
    try {
      await onSubmit(form);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40">
      <div
        className="w-full max-w-[440px] rounded-t-[28px] px-5 pb-8 pt-4"
        style={{ background: P.surface }}
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full" style={{ background: P.line }} />
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[20px] font-bold tracking-[-0.3px] text-ink">
            New assessment
          </h2>
          <button onClick={onClose} className="-m-2 p-2">
            <Icon name="close" size={20} color={P.ink3} />
          </button>
        </div>
        <div className="flex flex-col gap-2.5">
          <select
            className="input"
            value={form.module_id}
            onChange={(e) => setForm({ ...form, module_id: e.target.value })}
          >
            {modules.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          <input
            className="input"
            placeholder="Title (e.g. Coursework 2)"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />
          <input
            className="input"
            type="date"
            value={form.due_date}
            onChange={(e) => setForm({ ...form, due_date: e.target.value })}
          />
          <input
            className="input"
            type="number"
            placeholder="Weight %"
            value={form.weight}
            onChange={(e) => setForm({ ...form, weight: Number(e.target.value) })}
          />
          <button
            onClick={save}
            disabled={saving || !form.title || !form.due_date}
            className="btn-primary w-full"
          >
            {saving ? 'Saving…' : 'Save assessment'}
          </button>
        </div>
      </div>
    </div>
  );
}
