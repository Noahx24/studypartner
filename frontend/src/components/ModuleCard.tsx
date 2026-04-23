import { ProgressBar } from './ProgressBar';

export function ModuleCard({
  title,
  progress,
  remainingMinutes,
  nextDeadline,
  onClick,
}: {
  title: string;
  progress: number;
  remainingMinutes: number;
  nextDeadline?: string;
  onClick?: () => void;
}) {
  return (
    <article onClick={onClick} className={`card space-y-3 ${onClick ? 'cursor-pointer hover:shadow-md transition' : ''}`}>
      <h3 className="font-semibold text-slate-900">{title}</h3>
      <ProgressBar value={progress} label={`${progress}% complete`} />
      <p className="text-sm text-slate-600">Remaining workload: {remainingMinutes} minutes</p>
      <p className="text-xs text-slate-500">Assessment deadline: {nextDeadline ?? 'Not set'}</p>
    </article>
  );
}
