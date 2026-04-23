import type { ModuleContentResponse, ModuleForm, StudyUnitsResponse } from '../types';

interface ModuleDetailViewProps {
  module: ModuleForm;
  content?: ModuleContentResponse;
  units?: StudyUnitsResponse;
  onBack?: () => void;
}

export function ModuleDetailView({ module, content, units, onBack }: ModuleDetailViewProps) {
  const totalMinutes = units?.study_units.reduce((sum, u) => sum + u.estimated_minutes, 0) || 0;
  const completedUnits = units?.study_units.filter((u) => u.status === 'completed').length || 0;
  const totalUnits = units?.study_units.length || 0;
  const progress = totalUnits > 0 ? Math.round((completedUnits / totalUnits) * 100) : 0;

  return (
    <div className="pb-24">
      {/* Header */}
      <div className="px-4 py-6 border-b border-slate-200">
        <div className="flex items-center gap-3 mb-4">
          {onBack && (
            <button onClick={onBack} className="p-2 -m-2 hover:bg-slate-100 rounded-lg">
              <svg className="w-5 h-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          )}
          <div className="flex-1">
            <p className="text-xs font-mono text-slate-500 font-bold uppercase mb-1 tracking-wide">{module.id}</p>
            <h1 className="text-2xl font-bold text-slate-900">{module.name}</h1>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-slate-50 rounded-lg p-3">
            <p className="text-xs text-slate-500 font-mono font-bold uppercase mb-1">Progress</p>
            <p className="text-lg font-bold text-slate-900">{progress}%</p>
          </div>
          <div className="bg-slate-50 rounded-lg p-3">
            <p className="text-xs text-slate-500 font-mono font-bold uppercase mb-1">Time</p>
            <p className="text-lg font-bold text-slate-900">{Math.round(totalMinutes / 60)}h</p>
          </div>
          <div className="bg-slate-50 rounded-lg p-3">
            <p className="text-xs text-slate-500 font-mono font-bold uppercase mb-1">Units</p>
            <p className="text-lg font-bold text-slate-900">
              {completedUnits}/{totalUnits}
            </p>
          </div>
        </div>
      </div>

      {/* Topics/Units list */}
      <div className="px-4 py-6">
        {content?.topics.length === 0 || !content ? (
          <div className="text-center py-12">
            <p className="text-slate-500 text-sm">No topics loaded yet. Upload material to get started.</p>
          </div>
        ) : (
          <div>
            <h2 className="text-xs font-mono font-bold text-slate-500 uppercase mb-3 tracking-wide">Topics ({content.topics.length})</h2>
            <div className="space-y-2">
              {content.topics.map((topic) => {
                const topicUnits = units?.study_units.filter((u) => u.topic_id === topic.id) || [];
                const completedTopicUnits = topicUnits.filter((u) => u.status === 'completed').length;
                const topicProgress = topicUnits.length > 0 ? Math.round((completedTopicUnits / topicUnits.length) * 100) : 0;

                return (
                  <div key={topic.id} className="bg-white border border-slate-200 rounded-lg p-3 hover:border-slate-300 transition cursor-pointer">
                    <div className="flex items-start gap-3 mb-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-slate-900 text-sm">{topic.title}</p>
                        <p className="text-xs text-slate-500 font-mono mt-0.5">
                          {topic.word_count.toLocaleString()} words · ~{Math.round(topic.word_count / 250)} min
                        </p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-sm font-bold text-slate-700">{topicProgress}%</p>
                      </div>
                    </div>
                    {/* Progress bar */}
                    {topicUnits.length > 0 && (
                      <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-500 rounded-full transition-all"
                          style={{ width: `${topicProgress}%` }}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Study units breakdown */}
        {units && units.study_units.length > 0 && (
          <div className="mt-8">
            <h2 className="text-xs font-mono font-bold text-slate-500 uppercase mb-3 tracking-wide">Study units</h2>
            <div className="space-y-2">
              {units.study_units.map((unit) => {
                const statusColor = {
                  completed: 'bg-emerald-50 border-emerald-200 text-emerald-700',
                  in_progress: 'bg-blue-50 border-blue-200 text-blue-700',
                  not_started: 'bg-slate-50 border-slate-200 text-slate-600',
                }[unit.status];

                return (
                  <div key={unit.id} className={`border rounded-lg p-3 ${statusColor}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <p className="font-semibold text-sm">{unit.title}</p>
                        <p className="text-xs opacity-75 mt-0.5 font-mono">{unit.estimated_minutes}m estimated</p>
                      </div>
                      <span className="text-xs font-bold px-2 py-1 rounded bg-white bg-opacity-50 capitalize">{unit.status.replace('_', ' ')}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
