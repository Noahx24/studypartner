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
      toast.success(`Your week is planned — ${count} study sessions ready.`);
      onGenerated?.();
    } catch (err) {
      toast.error(err.message || "We couldn't build your plan. Please try again.");
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
        <><Loader2 className="w-5 h-5 mr-2 animate-spin" /> Planning your week…</>
      ) : (
        <><Sparkles className="w-5 h-5 mr-2" /> Plan my week</>
      )}
    </Button>
  );
}
