import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { Loader2, BookOpen, Clock, CalendarRange, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/lib/AuthContext';
import { api } from '@/api/client';
import { cn } from '@/lib/utils';

const ONBOARD_KEY = 'studypartner.onboarded';

/**
 * First-run wizard. Captures the inputs the planner needs to produce a
 * useful schedule on day one — without these the user lands on an empty
 * dashboard with default availability they never saw or confirmed.
 *
 * Three short steps:
 *   1. Daily hours (the planner's per-day cap)
 *   2. Days per week (5 by default — week + Sat / Sun off)
 *   3. Pace (multiplier on time-per-500-words for the user's reading speed)
 *
 * Saving persists to PATCH /users/me and stamps a localStorage flag so
 * the user is taken straight to the dashboard on subsequent logins.
 */
export default function Onboarding() {
  const { user, checkUserAuth } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState(0);
  const [hoursPerDay, setHoursPerDay] = useState(user?.hours_per_day ?? 2);
  const [daysPerWeek, setDaysPerWeek] = useState(user?.days_per_week ?? 5);
  const [pace, setPace] = useState(user?.pace ?? 'normal');
  const [saving, setSaving] = useState(false);

  const finish = async () => {
    setSaving(true);
    try {
      await api.updateMyProfile({
        hours_per_day: hoursPerDay,
        days_per_week: daysPerWeek,
        pace,
      });
      try {
        localStorage.setItem(ONBOARD_KEY, user?.id ?? 'unknown');
      } catch {
        /* ignore quota errors — we'll just re-prompt next time */
      }
      await checkUserAuth();
      toast.success('You’re all set');
      navigate('/');
    } catch (err) {
      toast.error(err.message || 'Could not save your preferences');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-primary mb-3">
            <BookOpen className="w-6 h-6 text-primary-foreground" />
          </div>
          <h1 className="font-heading text-2xl font-bold">Let’s tune your plan</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Three quick questions so the planner fits your real life.
          </p>
        </div>

        <div className="flex gap-1 mb-6">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className={cn(
                'h-1 flex-1 rounded-full transition-colors',
                i <= step ? 'bg-primary' : 'bg-muted',
              )}
            />
          ))}
        </div>

        <div className="bg-card rounded-2xl border p-5 space-y-5">
          {step === 0 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-primary" />
                <Label className="font-semibold">Hours per study day</Label>
              </div>
              <p className="text-xs text-muted-foreground">
                The planner won’t schedule more than this in a single day,
                even when deadlines are tight.
              </p>
              <div className="text-center py-3">
                <span className="font-mono text-4xl font-bold tabular-nums">{hoursPerDay.toFixed(1)}</span>
                <span className="text-muted-foreground ml-1">hrs</span>
              </div>
              <Slider
                value={[hoursPerDay]}
                onValueChange={([v]) => setHoursPerDay(v)}
                min={0.5}
                max={8}
                step={0.5}
              />
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <CalendarRange className="w-4 h-4 text-primary" />
                <Label className="font-semibold">Days per week</Label>
              </div>
              <p className="text-xs text-muted-foreground">
                Most students leave 1–2 days for rest. Pick what’s realistic
                for you.
              </p>
              <div className="grid grid-cols-7 gap-1.5">
                {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setDaysPerWeek(n)}
                    className={cn(
                      'h-10 rounded-xl text-sm font-semibold transition-colors',
                      daysPerWeek === n
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted hover:bg-muted/80 text-foreground',
                    )}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-primary" />
                <Label className="font-semibold">How fast do you read?</Label>
              </div>
              <p className="text-xs text-muted-foreground">
                Calibrates the time estimate for each subtopic. Don’t worry —
                if it’s wrong, the planner learns from your actual session
                durations and adjusts.
              </p>
              <div className="space-y-2">
                {[
                  { value: 'slow', label: 'Take my time', detail: 'I prefer to read carefully and re-read key concepts' },
                  { value: 'normal', label: 'Average', detail: 'Standard reading pace, occasional re-reads' },
                  { value: 'fast', label: 'Skim quickly', detail: 'I get through reading material fast' },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setPace(opt.value)}
                    className={cn(
                      'w-full text-left rounded-xl border-2 p-3 transition-colors',
                      pace === opt.value
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-primary/50',
                    )}
                  >
                    <div className="text-sm font-semibold">{opt.label}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{opt.detail}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-2 pt-3">
            {step > 0 && (
              <Button
                variant="outline"
                onClick={() => setStep((s) => s - 1)}
                disabled={saving}
                className="flex-1 rounded-xl"
              >
                Back
              </Button>
            )}
            {step < 2 ? (
              <Button
                onClick={() => setStep((s) => s + 1)}
                className="flex-1 rounded-xl"
              >
                Continue
              </Button>
            ) : (
              <Button
                onClick={finish}
                disabled={saving}
                className="flex-1 rounded-xl"
              >
                {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Finish
              </Button>
            )}
          </div>
        </div>

        <p className="text-center text-[11px] text-muted-foreground mt-4">
          You can change all of these later under Profile.
        </p>
      </div>
    </div>
  );
}

export const ONBOARDED_KEY = ONBOARD_KEY;
