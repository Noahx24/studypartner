import type { AssessmentForm, ModuleForm } from '../types';

interface AssessmentsViewProps {
  assessments: AssessmentForm[];
  modules: ModuleForm[];
  onAssessmentClick?: (assessment: AssessmentForm) => void;
}

export function AssessmentsView({ assessments, modules, onAssessmentClick }: AssessmentsViewProps) {
  // Sort by due date
  const sorted = [...assessments].sort((a, b) => a.due_date.localeCompare(b.due_date));

  // Group by status
  const now = new Date();
  const upcoming = sorted.filter((a) => new Date(a.due_date) >= now);
  const overdue = sorted.filter((a) => new Date(a.due_date) < now);

  const AssessmentCard = ({ assessment, overdue: isOverdue }: { assessment: AssessmentForm; overdue: boolean }) => {
    const dueDate = new Date(assessment.due_date);
    const daysLeft = Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    const isUrgent = daysLeft <= 14 && !isOverdue;
    const module = modules.find((m) => m.id === assessment.module_id);

    return (
      <div
        onClick={() => onAssessmentClick?.(assessment)}
        className="bg-white border border-slate-200 rounded-xl p-4 cursor-pointer hover:shadow-md transition"
      >
        <div className="flex gap-4">
          {/* Date badge */}
          <div
            className={`w-14 h-16 rounded-lg flex flex-col items-center justify-center flex-shrink-0 font-mono font-bold text-sm ${
              isOverdue
                ? 'bg-rose-50 text-rose-700'
                : isUrgent
                  ? 'bg-amber-50 text-amber-700'
                  : 'bg-blue-50 text-blue-700'
            }`}
          >
            <span className="text-xs opacity-75">{dueDate.toLocaleString('default', { month: 'short' }).toUpperCase()}</span>
            <span className="text-lg">{dueDate.getDate()}</span>
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            {module && (
              <p className="text-xs font-mono font-bold text-blue-600 mb-1 uppercase tracking-wide">{module.id}</p>
            )}
            <p className="font-semibold text-slate-900 mb-3">{assessment.title}</p>

            {/* Bottom row */}
            <div className="flex gap-3 items-center text-xs">
              <span
                className={`px-2.5 py-1 rounded-lg font-bold whitespace-nowrap ${
                  isOverdue
                    ? 'bg-rose-100 text-rose-700'
                    : isUrgent
                      ? 'bg-amber-100 text-amber-700'
                      : 'bg-blue-100 text-blue-700'
                }`}
              >
                {isOverdue ? 'Overdue' : `${Math.max(0, daysLeft)}d left`}
              </span>
              <span className="text-slate-500 font-mono">{assessment.weight}% of grade</span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="pb-24">
      {/* Header */}
      <div className="px-4 py-6 border-b border-slate-200">
        <p className="text-xs text-slate-500 font-mono font-bold uppercase mb-2 tracking-wide">Deadlines</p>
        <h1 className="text-3xl font-bold text-slate-900">Assessments</h1>
      </div>

      <div className="px-4 py-6">
        {assessments.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-slate-500">No assessments yet. Add some deadlines to get started.</p>
          </div>
        ) : (
          <>
            {/* Overdue section */}
            {overdue.length > 0 && (
              <div className="mb-8">
                <h2 className="text-xs font-mono font-bold text-rose-600 uppercase mb-3 tracking-wide">Overdue ({overdue.length})</h2>
                <div className="space-y-3">
                  {overdue.map((a) => (
                    <AssessmentCard key={a.id} assessment={a} overdue={true} />
                  ))}
                </div>
              </div>
            )}

            {/* Upcoming section */}
            {upcoming.length > 0 && (
              <div>
                <h2 className="text-xs font-mono font-bold text-slate-500 uppercase mb-3 tracking-wide">Upcoming ({upcoming.length})</h2>
                <div className="space-y-3">
                  {upcoming.map((a) => (
                    <AssessmentCard key={a.id} assessment={a} overdue={false} />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
