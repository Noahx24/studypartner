import React, { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Save, Loader2, Moon, LogOut, Trash2, UserCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/AuthContext';
import { api } from '@/api/client';

const DAYS = [
  { key: 'monday', label: 'Monday', short: 'Mon' },
  { key: 'tuesday', label: 'Tuesday', short: 'Tue' },
  { key: 'wednesday', label: 'Wednesday', short: 'Wed' },
  { key: 'thursday', label: 'Thursday', short: 'Thu' },
  { key: 'friday', label: 'Friday', short: 'Fri' },
  { key: 'saturday', label: 'Saturday', short: 'Sat' },
  { key: 'sunday', label: 'Sunday', short: 'Sun' },
];

const DEFAULT_HOURS = {
  monday: 2, tuesday: 0, wednesday: 2, thursday: 0,
  friday: 1, saturday: 4, sunday: 0,
};
const DEFAULT_REST = {
  monday: false, tuesday: true, wednesday: false, thursday: true,
  friday: false, saturday: false, sunday: true,
};

function hourLabel(h) {
  if (h === 0) return 'Rest';
  if (h === 0.5) return '30 min';
  if (h === 1) return '1 hour';
  return `${h} hours`;
}

function DayRow({ day, hours, isRest, onHoursChange, onRestToggle }) {
  return (
    <div className={cn(
      "bg-card rounded-2xl p-4 border transition-all",
      isRest ? "border-border/40 opacity-60" : "border-primary/15 shadow-sm"
    )}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-sm w-24">{day.label}</span>
          {isRest && (
            <span className="text-[10px] bg-muted text-muted-foreground px-2 py-0.5 rounded-full font-medium flex items-center gap-1">
              <Moon className="w-3 h-3" /> Rest
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className={cn(
            "text-sm font-heading font-bold w-16 text-right",
            isRest ? "text-muted-foreground" : hours >= 4 ? "text-primary" : "text-foreground"
          )}>
            {isRest ? '—' : hourLabel(hours)}
          </span>
          <Switch checked={!isRest} onCheckedChange={(v) => onRestToggle(!v)} />
        </div>
      </div>

      {!isRest && (
        <div className="px-1">
          <Slider
            value={[hours]}
            min={0.5}
            max={10}
            step={0.5}
            onValueChange={([v]) => onHoursChange(v)}
            className="w-full"
          />
          <div className="flex justify-between mt-1">
            <span className="text-[10px] text-muted-foreground">30 min</span>
            <span className="text-[10px] text-muted-foreground">10 hrs</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Profile() {
  const queryClient = useQueryClient();
  const { user, checkUserAuth, logout } = useAuth();
  const [hours, setHours] = useState({ ...DEFAULT_HOURS });
  const [restDays, setRestDays] = useState({ ...DEFAULT_REST });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  // Seed the per-day sliders from the saved aggregate settings once
  // the profile loads: the first `days_per_week` days become active
  // at `hours_per_day` each.
  useEffect(() => {
    if (!user || hydrated) return;
    const activeDays = Math.min(Math.max(Math.round(user.days_per_week ?? 5), 1), 7);
    const perDay = Math.min(Math.max(user.hours_per_day ?? 2, 0.5), 10);
    const nextHours = {};
    const nextRest = {};
    DAYS.forEach((d, i) => {
      const active = i < activeDays;
      nextRest[d.key] = !active;
      nextHours[d.key] = active ? perDay : 0;
    });
    setHours(nextHours);
    setRestDays(nextRest);
    setHydrated(true);
  }, [user, hydrated]);

  const totalWeeklyHours = DAYS.reduce((sum, d) => sum + (restDays[d.key] ? 0 : hours[d.key]), 0);

  const handleSave = async () => {
    const activeDays = DAYS.filter(d => !restDays[d.key]);
    if (activeDays.length === 0) {
      toast.error('Pick at least one study day');
      return;
    }
    setSaving(true);
    // The planner works from aggregates: study days per week, average
    // hours on a study day, and the per-day ceiling.
    const total = activeDays.reduce((sum, d) => sum + hours[d.key], 0);
    const avg = Math.max(0.5, Math.round((total / activeDays.length) * 2) / 2);
    const maxHours = Math.max(...activeDays.map(d => hours[d.key]));
    try {
      await api.updateMe({
        hours_per_day: avg,
        days_per_week: activeDays.length,
        max_daily_hours: maxHours,
      });
      await checkUserAuth();
      toast.success('Schedule saved!');
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
    } catch (err) {
      toast.error(err.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAccount = async () => {
    setDeleting(true);
    try {
      await api.deleteAccount();
      toast.success('Account deleted');
      await logout();
    } catch (err) {
      toast.error(err.message || 'Delete failed');
      setDeleting(false);
    }
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-heading text-2xl font-bold">My Profile</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Set how many hours you can study each day
        </p>
      </div>

      {/* Weekly Summary */}
      <div className="bg-primary/5 border border-primary/15 rounded-2xl p-4 mb-6 flex items-center justify-between">
        <div>
          <p className="text-xs text-muted-foreground font-medium">Weekly study budget</p>
          <p className="text-3xl font-heading font-bold text-primary mt-0.5 font-mono tracking-tight">{totalWeeklyHours}h</p>
        </div>
        <div className="flex gap-1">
          {DAYS.map(d => (
            <div key={d.key} className="flex flex-col items-center gap-1">
              <div className={cn(
                "w-5 rounded-sm transition-all",
                restDays[d.key] ? "bg-muted h-1" : "bg-primary",
              )} style={{ height: restDays[d.key] ? 4 : Math.max(4, (hours[d.key] / 10) * 40) }} />
              <span className="text-[9px] text-muted-foreground">{d.short[0]}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Day Sliders */}
      <div className="space-y-3 mb-6">
        {DAYS.map(d => (
          <DayRow
            key={d.key}
            day={d}
            hours={hours[d.key]}
            isRest={restDays[d.key]}
            onHoursChange={(v) => setHours(prev => ({ ...prev, [d.key]: v }))}
            onRestToggle={(v) => setRestDays(prev => ({ ...prev, [d.key]: v }))}
          />
        ))}
      </div>

      <Button onClick={handleSave} disabled={saving} className="w-full rounded-xl h-11">
        {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving...</> : <><Save className="w-4 h-4 mr-2" /> Save Schedule</>}
      </Button>

      {/* Account */}
      <div className="mt-8">
        <h2 className="font-heading font-semibold text-sm text-muted-foreground mb-2">Account</h2>
        <div className="bg-card rounded-2xl border border-border/50 shadow-sm divide-y divide-border/50">
          <div className="flex items-center gap-3 p-4">
            <div className="w-10 h-10 rounded-xl bg-primary/5 flex items-center justify-center flex-shrink-0">
              <UserCircle className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate">{user?.name}</p>
              <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
            </div>
          </div>
          <button
            onClick={logout}
            className="w-full flex items-center gap-3 p-4 text-sm font-medium hover:bg-muted/50 transition-colors"
          >
            <LogOut className="w-4 h-4 text-muted-foreground" /> Sign out
          </button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <button
                disabled={deleting}
                className="w-full flex items-center gap-3 p-4 text-sm font-medium text-destructive hover:bg-destructive/5 transition-colors disabled:opacity-50"
              >
                {deleting
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <Trash2 className="w-4 h-4" />} Delete account
              </button>
            </AlertDialogTrigger>
            <AlertDialogContent className="max-w-md mx-4 rounded-2xl">
              <AlertDialogHeader>
                <AlertDialogTitle>Delete your account?</AlertDialogTitle>
                <AlertDialogDescription>
                  This permanently removes your account, modules, uploads, study plans
                  and packs. This cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDeleteAccount}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Delete everything
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    </div>
  );
}