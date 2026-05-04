import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Save, Loader2, Moon, Sun, Coffee } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

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
  const [hours, setHours] = useState({ ...DEFAULT_HOURS });
  const [restDays, setRestDays] = useState({ ...DEFAULT_REST });
  const [saving, setSaving] = useState(false);

  const { data: availability = [], isLoading } = useQuery({
    queryKey: ['availability'],
    queryFn: () => base44.entities.Availability.list('day_of_week', 20),
  });

  useEffect(() => {
    if (availability.length > 0) {
      const h = {}, r = {};
      DAYS.forEach(d => {
        const slot = availability.find(a => a.day_of_week === d.key);
        h[d.key] = slot ? (slot.hours_available || 0) : DEFAULT_HOURS[d.key];
        r[d.key] = slot ? (slot.is_rest_day || false) : DEFAULT_REST[d.key];
      });
      setHours(h);
      setRestDays(r);
    }
  }, [availability]);

  const totalWeeklyHours = DAYS.reduce((sum, d) => sum + (restDays[d.key] ? 0 : hours[d.key]), 0);

  const handleSave = async () => {
    setSaving(true);
    for (const existing of availability) {
      await base44.entities.Availability.delete(existing.id);
    }
    const records = DAYS.map(d => ({
      day_of_week: d.key,
      hours_available: restDays[d.key] ? 0 : hours[d.key],
      is_rest_day: restDays[d.key],
    }));
    await base44.entities.Availability.bulkCreate(records);
    toast.success('Schedule saved!');
    setSaving(false);
    queryClient.invalidateQueries({ queryKey: ['availability'] });
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
    </div>
  );
}