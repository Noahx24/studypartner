import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Sparkles, Loader2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { format } from 'date-fns';

export default function GeneratePlanButton({ materials, availability, onGenerated }) {
  const [generating, setGenerating] = useState(false);

  const handleGenerate = async () => {
    if (materials.length === 0) {
      toast.error('Add some modules first');
      return;
    }
    const activeSlots = availability.filter(a => !a.is_rest_day && (a.hours_available || 0) > 0);
    if (activeSlots.length === 0) {
      toast.error('Set your study availability in Profile first');
      return;
    }

    setGenerating(true);
    const today = new Date();

    const modulesInfo = materials
      .filter(m => m.status !== 'completed')
      .map(m => ({
        id: m.id,
        title: m.title,
        subject: m.subject,
        estimated_hours: m.estimated_hours || 2,
        complexity: m.complexity || 'moderate',
        priority: m.priority || 'medium',
        exam_date: m.exam_date || null,
        assignment_date: m.assignment_date || null,
        progress_percent: m.progress_percent || 0,
        units: (m.units || []).map(u => ({
          number: u.number,
          title: u.title,
          estimated_hours: u.estimated_hours,
          status: u.status,
        })),
      }));

    const availabilityInfo = activeSlots.map(a => ({
      day: a.day_of_week,
      hours_available: a.hours_available,
    }));

    const result = await base44.integrations.Core.InvokeLLM({
      prompt: `You are an AI study planner for a working student with limited time. Generate a realistic 14-day study plan starting ${format(today, 'yyyy-MM-dd')} (${format(today, 'EEEE')}).

STUDENT MODULES:
${JSON.stringify(modulesInfo, null, 2)}

WEEKLY AVAILABILITY (hours per day):
${JSON.stringify(availabilityInfo, null, 2)}

CRITICAL RULES — follow strictly:
1. DEADLINES ARE THE TOP PRIORITY. Modules with exam_date or assignment_date closest to today must be studied FIRST and most intensively.
2. Work backwards from each deadline — ensure all units of that module are covered before the exam/assignment date.
3. Daily session time must NOT exceed the student's hours_available for that day.
4. Each individual session: 30–60 minutes. Multiple sessions per day are allowed if hours permit.
5. Session title should reference the specific unit: e.g. "Unit 2 – Thermodynamics (Chemistry 101)"
6. Description should say exactly what to do in the session.
7. Don't schedule on rest days (not in availabilityInfo).
8. Heavier complexity = shorter sessions (30–40 min).
9. Spread load — don't cram one subject for all sessions in a day.
10. Skip units already marked completed in progress.
11. Include a mix: new learning + review sessions especially before exam dates.

Return the full session list. Each session: material_id, title, description, date (YYYY-MM-DD), start_time (HH:mm, assume study time starts at the typical time like evening 18:00 or morning for weekend), duration_minutes, subject, complexity.`,
      response_json_schema: {
        type: 'object',
        properties: {
          sessions: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                material_id: { type: 'string' },
                title: { type: 'string' },
                description: { type: 'string' },
                date: { type: 'string' },
                start_time: { type: 'string' },
                duration_minutes: { type: 'number' },
                subject: { type: 'string' },
                complexity: { type: 'string', enum: ['light', 'moderate', 'heavy'] },
              },
            },
          },
        },
      },
    });

    if (result.sessions && result.sessions.length > 0) {
      await base44.entities.StudySession.bulkCreate(
        result.sessions.map(s => ({ ...s, status: 'scheduled' }))
      );
      toast.success(`Generated ${result.sessions.length} sessions across 14 days!`);
      onGenerated();
    } else {
      toast.error('Could not generate plan. Check your modules and availability.');
    }
    setGenerating(false);
  };

  return (
    <Button
      onClick={handleGenerate}
      disabled={generating}
      className="w-full rounded-xl h-12 text-base font-semibold"
      size="lg"
    >
      {generating ? (
        <><Loader2 className="w-5 h-5 mr-2 animate-spin" /> Generating AI Plan...</>
      ) : (
        <><Sparkles className="w-5 h-5 mr-2" /> Generate Deadline-Driven Plan</>
      )}
    </Button>
  );
}