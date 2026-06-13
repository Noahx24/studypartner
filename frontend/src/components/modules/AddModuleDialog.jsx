import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Upload, Loader2, Sparkles, CheckCircle2, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/AuthContext';
import { api } from '@/api/client';
import { v4 as uuidv4 } from 'uuid';

// Step 1: Basic info form
function BasicInfoStep({ form, setForm, file, onFileChange, onNext, loading }) {
  return (
    <div className="space-y-4">
      <div>
        <Label className="text-xs font-medium">Module Title *</Label>
        <Input
          placeholder="e.g. Organic Chemistry"
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          className="mt-1"
        />
      </div>
      <div>
        <Label className="text-xs font-medium">Subject / Course *</Label>
        <Input
          placeholder="e.g. Chemistry 101"
          value={form.subject}
          onChange={(e) => setForm({ ...form, subject: e.target.value })}
          className="mt-1"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs font-medium">Type</Label>
          <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="notes">Notes</SelectItem>
              <SelectItem value="textbook">Textbook</SelectItem>
              <SelectItem value="pdf">PDF</SelectItem>
              <SelectItem value="past_paper">Past Paper</SelectItem>
              <SelectItem value="slides">Slides</SelectItem>
              <SelectItem value="other">Other</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs font-medium">Priority</Label>
          <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}>
            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="low">Low</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="critical">Critical</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs font-medium">Exam Date</Label>
          <Input type="date" value={form.exam_date} onChange={(e) => setForm({ ...form, exam_date: e.target.value })} className="mt-1" />
        </div>
        <div>
          <Label className="text-xs font-medium">Assignment Due</Label>
          <Input type="date" value={form.assignment_date} onChange={(e) => setForm({ ...form, assignment_date: e.target.value })} className="mt-1" />
        </div>
      </div>
      <div>
        <Label className="text-xs font-medium">Estimated Pages</Label>
        <Input type="number" placeholder="e.g. 80" value={form.estimated_pages} onChange={(e) => setForm({ ...form, estimated_pages: e.target.value })} className="mt-1" />
      </div>

      {/* File Upload */}
      <div>
        <Label className="text-xs font-medium">Upload File (optional — AI will parse units)</Label>
        <label className="mt-1 flex items-center justify-center gap-2 border-2 border-dashed rounded-xl p-4 cursor-pointer hover:border-primary/50 transition-colors">
          <Upload className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground truncate max-w-[200px]">
            {file ? file.name : 'Upload PDF, image, or document'}
          </span>
          <input type="file" className="hidden" onChange={onFileChange} />
        </label>
      </div>

      <Button onClick={onNext} disabled={loading} className="w-full rounded-xl h-11">
        {loading ? (
          <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Analyzing with AI...</>
        ) : (
          <><Sparkles className="w-4 h-4 mr-2" /> Analyze & Extract Units</>
        )}
      </Button>
    </div>
  );
}

// Step 2: Confirm AI extracted data
function ConfirmStep({ analysis, onConfirm, onRegenerate, feedback, setFeedback, loading }) {
  const [showUnits, setShowUnits] = useState(true);
  return (
    <div className="space-y-4">
      <div className="bg-primary/5 border border-primary/20 rounded-xl p-3">
        <div className="flex items-center gap-2 mb-1">
          <Sparkles className="w-4 h-4 text-primary" />
          <span className="text-xs font-semibold text-primary">AI Analysis Complete</span>
        </div>
        <p className="text-xs text-muted-foreground">{analysis.topics_summary}</p>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="bg-muted/50 rounded-xl p-3 text-center">
          <p className="text-lg font-heading font-bold">{analysis.estimated_hours}h</p>
          <p className="text-[10px] text-muted-foreground">Est. Study Time</p>
        </div>
        <div className="bg-muted/50 rounded-xl p-3 text-center">
          <p className="text-lg font-heading font-bold capitalize">{analysis.complexity}</p>
          <p className="text-[10px] text-muted-foreground">Complexity</p>
        </div>
        <div className="bg-muted/50 rounded-xl p-3 text-center">
          <p className="text-lg font-heading font-bold">{(analysis.units || []).length}</p>
          <p className="text-[10px] text-muted-foreground">Units Found</p>
        </div>
      </div>

      {/* Units */}
      {(analysis.units || []).length > 0 && (
        <div>
          <button
            onClick={() => setShowUnits(!showUnits)}
            className="flex items-center gap-1 text-xs font-semibold mb-2 text-foreground"
          >
            Units {showUnits ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
          {showUnits && (
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {(analysis.units || []).map((unit, i) => (
                <div key={i} className="flex items-start gap-2.5 p-2.5 bg-muted/40 rounded-xl">
                  <div className="w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px] font-bold flex-shrink-0 mt-0.5">
                    {unit.number || i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium leading-tight">{unit.title}</p>
                    {unit.summary && <p className="text-[11px] text-muted-foreground mt-0.5">{unit.summary}</p>}
                    {unit.estimated_hours && <p className="text-[10px] text-muted-foreground mt-0.5">{unit.estimated_hours}h</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Feedback */}
      <div>
        <Label className="text-xs font-medium text-muted-foreground">
          Feedback to AI (optional — correct anything wrong)
        </Label>
        <Textarea
          placeholder="e.g. There are 5 units not 3. Unit 2 covers thermodynamics, not kinetics. Increase time estimates."
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          className="mt-1 text-xs min-h-[70px] resize-none"
        />
      </div>

      <div className="flex gap-2">
        {feedback.trim() && (
          <Button variant="outline" onClick={onRegenerate} disabled={loading} className="flex-1 rounded-xl h-10 text-sm">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><RefreshCw className="w-3.5 h-3.5 mr-1.5" />Re-analyze</>}
          </Button>
        )}
        <Button onClick={onConfirm} disabled={loading} className="flex-1 rounded-xl h-10 text-sm">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />Looks Good, Save</>}
        </Button>
      </div>
    </div>
  );
}

export default function AddModuleDialog({ open, onOpenChange, onCreated }) {
  const { user } = useAuth();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    title: '', subject: '', type: 'notes', priority: 'medium',
    exam_date: '', assignment_date: '', estimated_pages: '',
  });
  const [file, setFile] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [feedback, setFeedback] = useState('');
  const [loading, setLoading] = useState(false);

  const reset = () => {
    setStep(1);
    setForm({ title: '', subject: '', type: 'notes', priority: 'medium', exam_date: '', assignment_date: '', estimated_pages: '' });
    setFile(null);
    setAnalysis(null);
    setFeedback('');
    setLoading(false);
  };

  const handleClose = (v) => {
    if (!v) reset();
    onOpenChange(v);
  };

  const handleNext = async () => {
    if (!form.title || !form.subject) { toast.error('Fill in title and subject'); return; }
    if (!file && !form.subject) { toast.error('Upload a file or enter a subject'); return; }
    setLoading(true);
    try {
      const moduleId = uuidv4();
      const moduleType = ['textbook', 'pdf', 'slides'].includes(form.type) ? 'semester' : 'semester';
      const result = await api.uploadContent({
        user_id: user.id,
        module_id: moduleId,
        module_name: form.title,
        module_type: moduleType,
        pasted_text: !file ? `${form.title}: ${form.subject}` : undefined,
        file: file || undefined,
      });
      // The upload response is counts-only; pull the real extracted units so
      // the confirm screen can list them (and "Units Found" isn't stuck at 0).
      const struct = await api.getModuleStructure(moduleId).catch(() => null);
      const units = (struct?.learning_units || []).map((u) => ({
        number: u.ordinal,
        title: u.topic,
        summary: `${(u.subtopics || []).length} subtopic${(u.subtopics || []).length === 1 ? '' : 's'}`,
        estimated_hours: Math.max(1, Math.ceil((u.subtopics || []).length * 0.5)),
      }));
      setAnalysis({
        module_id: moduleId,
        learning_unit_count: result.learning_unit_count,
        subtopic_count: result.subtopic_count,
        topics_summary: `${result.learning_unit_count} learning units with ${result.subtopic_count} subtopics extracted.`,
        estimated_hours: Math.ceil(result.subtopic_count * 0.5),
        complexity: result.subtopic_count > 20 ? 'heavy' : result.subtopic_count > 10 ? 'moderate' : 'light',
        units,
      });
      setStep(2);
    } catch (err) {
      toast.error(err.message || 'Upload failed');
    } finally {
      setLoading(false);
    }
  };

  const handleRegenerate = async () => {
    toast.info('Re-upload the file to re-analyze');
    setFeedback('');
  };

  const handleSave = async () => {
    toast.success('Module saved!');
    onCreated();
    handleClose(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md mx-4 rounded-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-heading">
            {step === 1 ? 'Add Module' : 'Confirm AI Analysis'}
          </DialogTitle>
          <div className="flex gap-1.5 mt-2">
            {[1, 2].map(s => (
              <div key={s} className={cn("h-1 flex-1 rounded-full transition-colors", s <= step ? "bg-primary" : "bg-muted")} />
            ))}
          </div>
        </DialogHeader>

        <div className="mt-2">
          {step === 1 ? (
            <BasicInfoStep
              form={form} setForm={setForm}
              file={file} onFileChange={(e) => setFile(e.target.files?.[0] || null)}
              onNext={handleNext} loading={loading}
            />
          ) : (
            <ConfirmStep
              analysis={analysis} form={form}
              onConfirm={handleSave}
              onRegenerate={handleRegenerate}
              onFeedback={() => {}}
              feedback={feedback} setFeedback={setFeedback}
              loading={loading}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}