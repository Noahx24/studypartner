import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { api } from '@/api/client';
import FetchFromMyModulesButton from '@/components/modules/FetchFromMyModulesButton';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import {
  BookOpen,
  CalendarClock,
  Cloud,
  ListPlus,
  Loader2,
  PartyPopper,
  Rabbit,
  Snail,
  Squirrel,
} from 'lucide-react';

const PACES = [
  { value: 'slow', label: 'Thorough', desc: 'I read slowly and take detailed notes', Icon: Snail },
  { value: 'normal', label: 'Steady', desc: 'A balanced pace works for me', Icon: Squirrel },
  { value: 'fast', label: 'Quick', desc: 'I skim fast and revise often', Icon: Rabbit },
];

const STEPS = ['Availability', 'Connect Moodle', 'Done'];

function StepDots({ step }) {
  return (
    <div className="flex items-center justify-center gap-2 mb-6">
      {STEPS.map((label, i) => (
        <div key={label} className="flex items-center gap-2">
          <div
            className={cn(
              'w-2.5 h-2.5 rounded-full transition-all',
              i === step ? 'bg-primary scale-125' : i < step ? 'bg-primary/50' : 'bg-slate-200',
            )}
          />
        </div>
      ))}
    </div>
  );
}

export default function Onboarding() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [hoursPerDay, setHoursPerDay] = useState(2);
  const [daysPerWeek, setDaysPerWeek] = useState(5);
  const [pace, setPace] = useState('normal');

  const saveAvailability = async () => {
    setSaving(true);
    try {
      await api.updateMe({
        hours_per_day: hoursPerDay,
        days_per_week: daysPerWeek,
        pace,
        // A sensible ceiling: allow catch-up days without doubling workload.
        max_daily_hours: Math.min(24, hoursPerDay + 1),
      });
      setStep(1);
    } catch (err) {
      toast.error(err.message || 'Could not save your study settings.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary mb-4">
            <BookOpen className="w-7 h-7 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Welcome to StudyPartner</h1>
          <p className="text-sm text-slate-500 mt-1">Let&apos;s set up your study plan</p>
        </div>

        <StepDots step={step} />

        {step === 0 && (
          <div className="space-y-6">
            <div className="bg-card rounded-2xl p-5 border space-y-5">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <CalendarClock className="w-4 h-4 text-primary" />
                Your real availability
              </div>

              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-slate-600">Hours per study day</span>
                  <span className="font-bold">{hoursPerDay}h</span>
                </div>
                <Slider
                  value={[hoursPerDay]}
                  min={0.5}
                  max={8}
                  step={0.5}
                  onValueChange={([v]) => setHoursPerDay(v)}
                />
              </div>

              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-slate-600">Study days per week</span>
                  <span className="font-bold">{daysPerWeek}</span>
                </div>
                <div className="flex gap-1.5">
                  {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setDaysPerWeek(d)}
                      className={cn(
                        'flex-1 py-2 rounded-lg text-sm font-medium border transition-all',
                        d === daysPerWeek
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300',
                      )}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-sm text-slate-600 mb-2">How do you study?</p>
                <div className="space-y-2">
                  {PACES.map(({ value, label, desc, Icon }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setPace(value)}
                      className={cn(
                        'w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-all',
                        pace === value
                          ? 'border-primary bg-primary/5'
                          : 'border-slate-200 bg-white hover:border-slate-300',
                      )}
                    >
                      <Icon className={cn('w-5 h-5 shrink-0', pace === value ? 'text-primary' : 'text-slate-400')} />
                      <span>
                        <span className="block text-sm font-semibold">{label}</span>
                        <span className="block text-xs text-slate-500">{desc}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <Button className="w-full" onClick={saveAvailability} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Continue
            </Button>
            <p className="text-center text-xs text-slate-400">
              About {Math.round(hoursPerDay * daysPerWeek)} hours of study a week — you can change this anytime in Profile.
            </p>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <div className="bg-card rounded-2xl p-5 border text-center space-y-3">
              <Cloud className="w-10 h-10 text-primary mx-auto" />
              <h2 className="font-semibold">Connect myModules</h2>
              <p className="text-sm text-slate-500">
                Pull your modules, study guides and assignment dates straight from
                your school&apos;s Moodle. Metadata only — files download when you
                pick them, so it&apos;s easy on your data.
              </p>
              <FetchFromMyModulesButton className="w-full rounded-xl" />
            </div>

            <div className="bg-card rounded-2xl p-5 border text-center space-y-3">
              <ListPlus className="w-10 h-10 text-primary mx-auto" />
              <h2 className="font-semibold">Or add modules manually</h2>
              <p className="text-sm text-slate-500">
                No Moodle? Add your modules yourself and upload study guides as
                PDF, DOCX or plain text.
              </p>
              <Button
                variant="outline"
                className="w-full rounded-xl"
                onClick={() => navigate('/modules', { replace: true })}
              >
                Add modules manually
              </Button>
            </div>

            <Button variant="ghost" className="w-full text-slate-500" onClick={() => setStep(2)}>
              Skip for now
            </Button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6 text-center">
            <div className="bg-card rounded-2xl p-6 border space-y-3">
              <PartyPopper className="w-10 h-10 text-primary mx-auto" />
              <h2 className="font-semibold text-lg">You&apos;re all set</h2>
              <p className="text-sm text-slate-500">
                {hoursPerDay}h a day, {daysPerWeek} days a week. Add your modules and
                deadlines, and StudyPartner will build a plan that fits.
              </p>
            </div>
            <Button className="w-full" onClick={() => navigate('/', { replace: true })}>
              Go to my dashboard
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
