import { useState } from 'react';
import { api } from '../api/client';
import { Card, Screen, ScreenHeader } from '../ui/primitives';
import { Icon } from '../ui/Icon';
import { P, MONO, moduleColor } from '../ui/tokens';
import type { ModuleForm } from '../types';

type Props = {
  userId: string;
  modules: ModuleForm[];
  moduleId?: string;
  onBack: () => void;
  onUploaded: (moduleId: string) => Promise<void>;
};

export function UploadView({ userId, modules, moduleId, onBack, onUploaded }: Props) {
  const initial = modules.find((m) => m.id === moduleId) ?? {
    id: '',
    name: '',
    module_type: 'semester' as const,
  };
  const [moduleForm, setModuleForm] = useState<ModuleForm>(initial);
  const [pastedText, setPastedText] = useState('');
  const [file, setFile] = useState<File | undefined>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    learning_unit_count: number;
    subtopic_count: number;
    page_count: number | null;
  } | null>(null);

  const pickExisting = (id: string) => {
    const m = modules.find((x) => x.id === id);
    if (m) setModuleForm(m);
  };

  const submit = async () => {
    if (!moduleForm.id || !moduleForm.name) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.uploadContent({
        user_id: userId,
        module_id: moduleForm.id,
        module_name: moduleForm.name,
        module_type: moduleForm.module_type,
        pasted_text: pastedText || undefined,
        file,
      });
      setResult({
        learning_unit_count: res.learning_unit_count,
        subtopic_count: res.subtopic_count,
        page_count: res.page_count,
      });
      await onUploaded(moduleForm.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setLoading(false);
    }
  };

  const c = moduleForm.id ? moduleColor(moduleForm.id) : null;

  return (
    <Screen>
      <ScreenHeader
        subtitle="ADD MATERIAL"
        title="Upload"
        right={
          <button onClick={onBack} className="text-[13px] font-semibold text-ink2">
            Cancel
          </button>
        }
      />

      <div className="px-4">
        {error && (
          <div
            className="mb-3 rounded-[12px] px-3 py-2 text-sm"
            style={{ background: P.coralSoft, color: P.coralDeep }}
          >
            {error}
          </div>
        )}

        <Card>
          <div className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-ink3">
            Module
          </div>
          {modules.length > 0 && (
            <select
              className="input mb-2.5"
              value={moduleForm.id}
              onChange={(e) => {
                if (e.target.value) pickExisting(e.target.value);
                else setModuleForm({ id: '', name: '', module_type: 'semester' });
              }}
            >
              <option value="">New module…</option>
              {modules.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          )}
          <input
            className="input mb-2.5"
            placeholder="Code (e.g. DATA2050)"
            value={moduleForm.id}
            onChange={(e) => setModuleForm({ ...moduleForm, id: e.target.value })}
          />
          <input
            className="input mb-2.5"
            placeholder="Name"
            value={moduleForm.name}
            onChange={(e) => setModuleForm({ ...moduleForm, name: e.target.value })}
          />
          <select
            className="input"
            value={moduleForm.module_type}
            onChange={(e) =>
              setModuleForm({
                ...moduleForm,
                module_type: e.target.value as 'year' | 'semester',
              })
            }
          >
            <option value="semester">Semester</option>
            <option value="year">Year</option>
          </select>
        </Card>

        <Card style={{ marginTop: 12 }}>
          <div className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-ink3">
            Material
          </div>
          <label
            className="mb-2.5 flex cursor-pointer items-center gap-3 rounded-[14px] border border-dashed px-4 py-5"
            style={{ borderColor: P.line }}
          >
            <div
              className="flex h-10 w-10 items-center justify-center rounded-full"
              style={{ background: c ? c.bg : P.primarySoft, color: c ? c.fg : P.primary }}
            >
              <Icon name="book" size={18} color={c ? c.fg : P.primary} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[14px] font-semibold text-ink">
                {file ? file.name : 'Choose a PDF, DOCX, or TXT'}
              </div>
              <div className="mono mt-0.5 text-[11px] text-ink3" style={{ fontFamily: MONO }}>
                {file ? `${Math.round(file.size / 1024)} KB` : 'Metadata only — no upload yet'}
              </div>
            </div>
            <input
              type="file"
              accept=".pdf,.docx,.txt"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0])}
            />
          </label>

          <div
            className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-ink3"
          >
            Or paste text
          </div>
          <textarea
            className="input min-h-[120px]"
            placeholder="Paste study text…"
            value={pastedText}
            onChange={(e) => setPastedText(e.target.value)}
          />
        </Card>

        <button
          onClick={submit}
          disabled={loading || !moduleForm.id || !moduleForm.name || (!file && !pastedText)}
          className="btn-primary mt-4 w-full"
        >
          {loading ? (
            <>
              <Icon name="refresh" size={16} color="#fff" /> Parsing…
            </>
          ) : (
            <>
              <Icon name="sparkles" size={16} color="#fff" /> Parse material
            </>
          )}
        </button>

        {result && (
          <Card style={{ marginTop: 14, background: P.mintSoft, border: 'none' }}>
            <div className="flex items-center gap-2.5">
              <Icon name="checkCircle" size={20} color={P.mintDeep} />
              <div>
                <div className="text-sm font-semibold" style={{ color: P.mintDeep }}>
                  Detected {result.learning_unit_count} learning units ·{' '}
                  {result.subtopic_count} subtopics
                </div>
                {result.page_count && (
                  <div
                    className="mono mt-0.5 text-[11px]"
                    style={{ color: P.mintDeep, opacity: 0.8, fontFamily: MONO }}
                  >
                    {result.page_count} pages
                  </div>
                )}
              </div>
            </div>
          </Card>
        )}
      </div>
    </Screen>
  );
}
