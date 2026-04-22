import { useState } from 'react';
import { api } from '../api/client';
import type { ModuleForm } from '../types';

export const UploadView = ({
  userId,
  loading,
  modules,
  onLoading,
  onModuleCreated,
  onWeekRefresh,
}: {
  userId: string;
  loading: boolean;
  modules: ModuleForm[];
  onLoading: (loading: boolean) => void;
  onModuleCreated: (module: ModuleForm) => void;
  onWeekRefresh: () => Promise<void>;
}) => {
  const [moduleForm, setModuleForm] = useState<ModuleForm>({ id: '', name: '', module_type: 'semester' });
  const [assessment, setAssessment] = useState({ id: '', title: '', due_date: '', weight: 30 });
  const [pastedText, setPastedText] = useState('');
  const [file, setFile] = useState<File | undefined>();
  const [ingestResult, setIngestResult] = useState<any>(null);

  const handleCreateModule = async () => {
    onLoading(true);
    await api.updateOrCreateModule(userId, moduleForm);
    onModuleCreated(moduleForm);
    onLoading(false);
  };

  const handleAssessment = async () => {
    onLoading(true);
    await api.addAssessment({ ...assessment, module_id: moduleForm.id, weight: Number(assessment.weight) });
    onLoading(false);
  };

  const handleUpload = async () => {
    onLoading(true);
    const result = await api.uploadContent({
      user_id: userId,
      module_id: moduleForm.id,
      module_name: moduleForm.name,
      module_type: moduleForm.module_type,
      pasted_text: pastedText || undefined,
      file,
    });
    setIngestResult(result);
    await onWeekRefresh();
    onLoading(false);
  };

  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold">Upload & modules</h2>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card space-y-3">
          <h3 className="text-sm font-medium">Create module</h3>
          <input className="input" placeholder="Module ID" value={moduleForm.id} onChange={(event) => setModuleForm({ ...moduleForm, id: event.target.value })} />
          <input className="input" placeholder="Module name" value={moduleForm.name} onChange={(event) => setModuleForm({ ...moduleForm, name: event.target.value })} />
          <select className="input" value={moduleForm.module_type} onChange={(event) => setModuleForm({ ...moduleForm, module_type: event.target.value as 'year' | 'semester' })}>
            <option value="year">Year</option>
            <option value="semester">Semester</option>
          </select>
          <button className="btn-primary" disabled={loading || !moduleForm.id || !moduleForm.name} onClick={handleCreateModule}>Create module</button>

          <h4 className="pt-2 text-sm font-medium">Add assessment</h4>
          <input className="input" placeholder="Assessment ID" value={assessment.id} onChange={(event) => setAssessment({ ...assessment, id: event.target.value })} />
          <input className="input" placeholder="Assessment title" value={assessment.title} onChange={(event) => setAssessment({ ...assessment, title: event.target.value })} />
          <input className="input" type="date" value={assessment.due_date} onChange={(event) => setAssessment({ ...assessment, due_date: event.target.value })} />
          <input className="input" type="number" value={assessment.weight} onChange={(event) => setAssessment({ ...assessment, weight: Number(event.target.value) })} />
          <button className="btn-secondary" disabled={loading || !assessment.id || !assessment.title || !assessment.due_date} onClick={handleAssessment}>Save assessment</button>
        </div>

        <div className="card space-y-3">
          <h3 className="text-sm font-medium">Upload content</h3>
          <select className="input" value={moduleForm.id} onChange={(event) => {
            const selected = modules.find((module) => module.id === event.target.value);
            if (selected) setModuleForm(selected);
          }}>
            <option value="">Select module</option>
            {modules.map((module) => (
              <option key={module.id} value={module.id}>{module.name}</option>
            ))}
          </select>
          <textarea className="input min-h-28" placeholder="Paste text" value={pastedText} onChange={(event) => setPastedText(event.target.value)} />
          <input className="input" type="file" accept=".pdf,.txt" onChange={(event) => setFile(event.target.files?.[0])} />
          <button className="btn-primary" disabled={loading || !moduleForm.id || (!pastedText && !file)} onClick={handleUpload}>{loading ? 'Uploading…' : 'Upload + parse'}</button>

          {ingestResult && (
            <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3 text-sm">
              <p className="font-medium">Detected topics: {ingestResult.topics?.length ?? 0}</p>
              <p className="text-zinc-400">Estimated total minutes: {ingestResult.total_estimated_minutes ?? 'n/a'}</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};
