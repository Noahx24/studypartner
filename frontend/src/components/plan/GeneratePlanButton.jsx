import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Sparkles, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/lib/AuthContext';
import { api } from '@/api/client';

export default function GeneratePlanButton({ onGenerated }) {
  const { user } = useAuth();
  const [generating, setGenerating] = useState(false);

  const handleGenerate = async () => {
    if (!user) return;
    setGenerating(true);
    try {
      const plan = await api.generatePlan(user.id);
      const count = plan.sessions?.length ?? 0;
      toast.success(`Generated ${count} sessions for this week!`);
      onGenerated?.();
    } catch (err) {
      toast.error(err.message || 'Could not generate plan');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Button
      onClick={handleGenerate}
      disabled={generating}
      className="w-full rounded-xl h-12 text-base font-semibold"
      size="lg"
    >
      {generating ? (
        <><Loader2 className="w-5 h-5 mr-2 animate-spin" /> Generating Plan...</>
      ) : (
        <><Sparkles className="w-5 h-5 mr-2" /> Generate Deadline-Driven Plan</>
      )}
    </Button>
  );
}
