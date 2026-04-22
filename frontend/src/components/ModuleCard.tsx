import { ProgressBar } from './ProgressBar';

export function ModuleCard({
  title,
  progress,
  remainingMinutes,
  nextDeadline,
}: {
  title: string;
  progress: number;
  remainingMinutes: number;
  nextDeadline?: string;
}) {
  return (
    <article className="card space-y-3">
      <h3 className="font-semibold text-slate-900">{title}</h3>
      <ProgressBar value={progress} label={`${progress}% complete`} />
      <p className="text-sm text-slate-600">Remaining workload: {remainingMinutes} minutes</p>
      <p className="text-xs text-slate-500">Assessment deadline: {nextDeadline ?? 'Not set'}</p>
    </article>
  );
}
