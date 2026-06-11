// Maps a module from GET /modules into the shape the cards and the
// calendar render: assessments are split into "exam" vs "assignment"
// buckets by title, and each bucket keeps its earliest due date.
const EXAM_RE = /exam|test|final/i;

const earliestDueDate = (assessments) =>
  assessments.length ? assessments.map((a) => a.due_date).sort()[0] : null;

export function mapApiModule(m) {
  const exams = m.assessments.filter((a) => EXAM_RE.test(a.title));
  const assignments = m.assessments.filter((a) => !EXAM_RE.test(a.title));
  return {
    id: m.id,
    title: m.name,
    name: m.name,
    subject: m.module_type === 'year' ? 'Year module' : 'Semester module',
    exam_date: earliestDueDate(exams),
    assignment_date: earliestDueDate(assignments),
    due_date: earliestDueDate(m.assessments),
    progress_percent: m.progress_percent,
    unit_count: m.unit_count,
    assessments: m.assessments,
  };
}
