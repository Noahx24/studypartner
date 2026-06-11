import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Plus,
  Pencil,
  Trash2,
  Sparkles,
  Loader2,
  Check,
  X,
  ChevronDown,
  ChevronRight,
  FileText,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { api } from '@/api/client';
import { toast } from 'sonner';

/**
 * Editor for the AI-parsed Learning Units and Subtopics of a single
 * module. The user can rename, add, or delete anything the AI got
 * wrong — every edit is logged server-side as `parsing_feedback`,
 * which feeds future AI runs on the same module as a few-shot
 * correction (so renaming "Big-O" → "Asymptotic Big-O" sticks for
 * subsequent summaries / quizzes).
 *
 * The same word_count / effort_score that drives the planner's time
 * estimates is recomputed on every content edit, so the user's
 * corrections also flow into the schedule.
 */
export default function UnitsEditor() {
  const { moduleId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [editingUnitId, setEditingUnitId] = useState(null);
  const [editingUnitTopic, setEditingUnitTopic] = useState('');
  const [editingSubtopicId, setEditingSubtopicId] = useState(null);
  const [editingSubtopicTitle, setEditingSubtopicTitle] = useState('');
  const [expandedUnits, setExpandedUnits] = useState(() => new Set());
  const [adderForUnitId, setAdderForUnitId] = useState(null);
  const [newSubtopicTitle, setNewSubtopicTitle] = useState('');
  const [newUnitOpen, setNewUnitOpen] = useState(false);
  const [newUnitTopic, setNewUnitTopic] = useState('');

  // Subtopic content editor — opened from the FileText icon on each
  // subtopic. We lazy-fetch the full content on open (it isn't part of
  // the structure response). Saving triggers PATCH { content }, which
  // recomputes word_count + effort_score server-side; the planner
  // then re-estimates time on the next plan generation.
  const [contentDialogSubtopic, setContentDialogSubtopic] = useState(null);
  const [draftContent, setDraftContent] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['module-structure', moduleId],
    queryFn: () => api.getModuleStructure(moduleId),
    enabled: !!moduleId,
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['module-structure', moduleId] });

  const createUnit = useMutation({
    mutationFn: (topic) => api.createLearningUnit(moduleId, { topic }),
    onSuccess: () => {
      toast.success('Unit added');
      setNewUnitTopic('');
      setNewUnitOpen(false);
      invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const renameUnit = useMutation({
    mutationFn: ({ unitId, topic }) => api.updateLearningUnit(unitId, { topic }),
    onSuccess: () => {
      toast.success('Unit renamed — AI will use this in future summaries');
      setEditingUnitId(null);
      invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const removeUnit = useMutation({
    mutationFn: (unitId) => api.deleteLearningUnit(unitId),
    onSuccess: () => {
      toast.success('Unit deleted');
      invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const createSubtopic = useMutation({
    mutationFn: ({ unitId, title }) =>
      api.createSubtopic(unitId, { title, content: '' }),
    onSuccess: () => {
      toast.success('Subtopic added');
      setAdderForUnitId(null);
      setNewSubtopicTitle('');
      invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const renameSubtopic = useMutation({
    mutationFn: ({ subtopicId, title }) => api.updateSubtopic(subtopicId, { title }),
    onSuccess: () => {
      toast.success('Subtopic renamed — feedback recorded');
      setEditingSubtopicId(null);
      invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const editContent = useMutation({
    mutationFn: ({ subtopicId, content }) =>
      api.updateSubtopic(subtopicId, { content }),
    onSuccess: (res) => {
      toast.success(`Saved — recomputed to ${res.word_count} words`);
      setContentDialogSubtopic(null);
      setDraftContent('');
      invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  // Lazy-load the full content the first time a content dialog opens.
  // We deliberately avoid bundling content into the structure response
  // — a textbook's worth of content would balloon that endpoint.
  useEffect(() => {
    if (!contentDialogSubtopic?.id) return;
    let cancelled = false;
    setDraftContent('');
    api.getSubtopic(contentDialogSubtopic.id).then((sub) => {
      if (!cancelled) setDraftContent(sub.content || '');
    }).catch((err) => toast.error(err.message));
    return () => {
      cancelled = true;
    };
  }, [contentDialogSubtopic?.id]);

  const removeSubtopic = useMutation({
    mutationFn: (subtopicId) => api.deleteSubtopic(subtopicId),
    onSuccess: () => {
      toast.success('Subtopic deleted');
      invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const toggleExpanded = (unitId) => {
    setExpandedUnits((prev) => {
      const next = new Set(prev);
      if (next.has(unitId)) next.delete(unitId);
      else next.add(unitId);
      return next;
    });
  };

  const startEditUnit = (unit) => {
    setEditingUnitId(unit.id);
    setEditingUnitTopic(unit.topic);
  };

  const startEditSubtopic = (sub) => {
    setEditingSubtopicId(sub.id);
    setEditingSubtopicTitle(sub.title);
  };

  const confirmDelete = (kind, name, fn) => {
    if (window.confirm(`Delete ${kind} "${name}"? This can't be undone.`)) {
      fn();
    }
  };

  const learningUnits = data?.learning_units ?? [];
  const totalSubs = learningUnits.reduce((n, u) => n + u.subtopics.length, 0);

  return (
    <div className="pb-32">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="rounded-xl"
            onClick={() => navigate('/modules')}
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h1 className="font-heading text-2xl font-bold">Parsed units</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {learningUnits.length} units · {totalSubs} subtopics
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-xl border bg-primary/5 p-3 mb-4 flex gap-3 items-start">
        <Sparkles className="w-4 h-4 text-primary mt-0.5 shrink-0" />
        <div className="text-xs text-muted-foreground">
          These are the units our AI extracted from your study guide.
          Rename, add, or delete anything that's wrong — your edits are
          fed back into the AI so summaries and quizzes match your
          vocabulary, and the planner re-estimates study time based on
          word count and complexity.
        </div>
      </div>

      {isLoading && (
        <div className="text-sm text-muted-foreground py-12 text-center">Loading…</div>
      )}

      {!isLoading && learningUnits.length === 0 && !newUnitOpen && (
        <div className="text-center py-16">
          <h3 className="font-heading font-semibold text-lg mb-1">No units yet</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Upload a study guide on the Modules page or add a unit manually.
          </p>
          <Button onClick={() => setNewUnitOpen(true)} className="rounded-xl">
            <Plus className="w-4 h-4 mr-1" /> Add unit
          </Button>
        </div>
      )}

      {learningUnits.map((unit) => {
        const isOpen = expandedUnits.has(unit.id);
        const isEditing = editingUnitId === unit.id;
        return (
          <section
            key={unit.id}
            className="rounded-xl border bg-card mb-3 overflow-hidden"
          >
            <header className="flex items-center gap-2 px-3 py-2.5">
              <button
                type="button"
                onClick={() => toggleExpanded(unit.id)}
                className="p-1 rounded hover:bg-muted/40"
                aria-label={isOpen ? 'Collapse unit' : 'Expand unit'}
              >
                {isOpen ? (
                  <ChevronDown className="w-4 h-4" />
                ) : (
                  <ChevronRight className="w-4 h-4" />
                )}
              </button>
              <span className="text-xs font-mono text-muted-foreground tabular-nums w-6 shrink-0">
                {unit.ordinal}.
              </span>

              {isEditing ? (
                <div className="flex flex-1 gap-1.5">
                  <Input
                    value={editingUnitTopic}
                    onChange={(e) => setEditingUnitTopic(e.target.value)}
                    className="h-8"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && editingUnitTopic.trim()) {
                        renameUnit.mutate({ unitId: unit.id, topic: editingUnitTopic.trim() });
                      }
                      if (e.key === 'Escape') setEditingUnitId(null);
                    }}
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-11 w-11 shrink-0"
                    onClick={() =>
                      editingUnitTopic.trim() &&
                      renameUnit.mutate({ unitId: unit.id, topic: editingUnitTopic.trim() })
                    }
                    disabled={renameUnit.isPending}
                  >
                    <Check className="w-4 h-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-11 w-11 shrink-0"
                    onClick={() => setEditingUnitId(null)}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              ) : (
                <>
                  <h2 className="font-semibold text-sm flex-1 truncate">{unit.topic}</h2>
                  <span className="text-[11px] text-muted-foreground shrink-0">
                    {unit.subtopics.length} subtopics
                  </span>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-11 w-11 shrink-0"
                    onClick={() => startEditUnit(unit)}
                    aria-label="Rename unit"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-11 w-11 shrink-0 text-destructive"
                    onClick={() => confirmDelete('unit', unit.topic, () => removeUnit.mutate(unit.id))}
                    aria-label="Delete unit"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </>
              )}
            </header>

            {isOpen && (
              <div className="border-t">
                {unit.subtopics.map((sub) => {
                  const isSubEditing = editingSubtopicId === sub.id;
                  return (
                    <div
                      key={sub.id}
                      className="flex items-center gap-2 px-3 py-2 border-b last:border-b-0"
                    >
                      <span className="text-[11px] font-mono text-muted-foreground tabular-nums w-10 shrink-0 pl-6">
                        {unit.ordinal}.{sub.ordinal}
                      </span>
                      {isSubEditing ? (
                        <div className="flex flex-1 gap-1.5">
                          <Input
                            value={editingSubtopicTitle}
                            onChange={(e) => setEditingSubtopicTitle(e.target.value)}
                            className="h-8"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && editingSubtopicTitle.trim()) {
                                renameSubtopic.mutate({ subtopicId: sub.id, title: editingSubtopicTitle.trim() });
                              }
                              if (e.key === 'Escape') setEditingSubtopicId(null);
                            }}
                          />
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-11 w-11 shrink-0"
                            onClick={() =>
                              editingSubtopicTitle.trim() &&
                              renameSubtopic.mutate({ subtopicId: sub.id, title: editingSubtopicTitle.trim() })
                            }
                          >
                            <Check className="w-4 h-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-11 w-11 shrink-0"
                            onClick={() => setEditingSubtopicId(null)}
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                      ) : (
                        <>
                          <span className="flex-1 text-sm truncate">{sub.title}</span>
                          <span className="text-[10px] text-muted-foreground shrink-0">
                            {sub.word_count} words
                          </span>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 shrink-0"
                            onClick={() => setContentDialogSubtopic(sub)}
                            aria-label="Edit content"
                            title="Edit content (recomputes word count + planner time estimate)"
                          >
                            <FileText className="w-3 h-3" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 shrink-0"
                            onClick={() => startEditSubtopic(sub)}
                            aria-label="Rename subtopic"
                          >
                            <Pencil className="w-3 h-3" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 shrink-0 text-destructive"
                            onClick={() =>
                              confirmDelete('subtopic', sub.title, () =>
                                removeSubtopic.mutate(sub.id),
                              )
                            }
                            aria-label="Delete subtopic"
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </>
                      )}
                    </div>
                  );
                })}

                {adderForUnitId === unit.id ? (
                  <div className="flex items-center gap-2 px-3 py-2 border-t bg-muted/20">
                    <span className="w-10 shrink-0 pl-6" />
                    <Input
                      value={newSubtopicTitle}
                      onChange={(e) => setNewSubtopicTitle(e.target.value)}
                      placeholder="New subtopic title…"
                      className="h-8 flex-1"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && newSubtopicTitle.trim()) {
                          createSubtopic.mutate({ unitId: unit.id, title: newSubtopicTitle.trim() });
                        }
                        if (e.key === 'Escape') {
                          setAdderForUnitId(null);
                          setNewSubtopicTitle('');
                        }
                      }}
                    />
                    <Button
                      size="sm"
                      onClick={() =>
                        newSubtopicTitle.trim() &&
                        createSubtopic.mutate({ unitId: unit.id, title: newSubtopicTitle.trim() })
                      }
                      disabled={createSubtopic.isPending || !newSubtopicTitle.trim()}
                      className="h-8"
                    >
                      Add
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setAdderForUnitId(null);
                        setNewSubtopicTitle('');
                      }}
                      className="h-8"
                    >
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <button
                    className="flex w-full items-center gap-2 px-3 py-2 text-xs text-muted-foreground hover:bg-muted/30 border-t"
                    onClick={() => setAdderForUnitId(unit.id)}
                  >
                    <Plus className="w-3 h-3" />
                    Add subtopic
                  </button>
                )}
              </div>
            )}
          </section>
        );
      })}

      {newUnitOpen ? (
        <div className="rounded-xl border bg-card p-3 flex gap-2 items-center">
          <Input
            value={newUnitTopic}
            onChange={(e) => setNewUnitTopic(e.target.value)}
            placeholder="New unit topic…"
            className="h-9 flex-1"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter' && newUnitTopic.trim()) createUnit.mutate(newUnitTopic.trim());
              if (e.key === 'Escape') {
                setNewUnitOpen(false);
                setNewUnitTopic('');
              }
            }}
          />
          <Button
            onClick={() => newUnitTopic.trim() && createUnit.mutate(newUnitTopic.trim())}
            disabled={createUnit.isPending || !newUnitTopic.trim()}
            className="rounded-xl"
          >
            {createUnit.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Add'}
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              setNewUnitOpen(false);
              setNewUnitTopic('');
            }}
            className="rounded-xl"
          >
            Cancel
          </Button>
        </div>
      ) : (
        learningUnits.length > 0 && (
          <Button
            onClick={() => setNewUnitOpen(true)}
            variant="outline"
            className="w-full rounded-xl"
          >
            <Plus className="w-4 h-4 mr-1" /> Add another unit
          </Button>
        )
      )}

      <Dialog
        open={contentDialogSubtopic !== null}
        onOpenChange={(open) => {
          if (!open) {
            setContentDialogSubtopic(null);
            setDraftContent('');
          }
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              Edit content — {contentDialogSubtopic?.title ?? ''}
            </DialogTitle>
            <DialogDescription>
              Save to recompute the word count and effort score. The
              planner picks up the new time estimate on the next plan
              generation.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={draftContent}
            onChange={(e) => setDraftContent(e.target.value)}
            className="min-h-[260px] font-mono text-xs"
            placeholder="Subtopic content…"
          />
          <div className="flex justify-between text-[11px] text-muted-foreground -mt-1">
            <span>
              Was {contentDialogSubtopic?.word_count ?? 0} words.
            </span>
            <span>
              Now {draftContent.match(/\w+/g)?.length ?? 0} words (live)
            </span>
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => {
                setContentDialogSubtopic(null);
                setDraftContent('');
              }}
              disabled={editContent.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={() =>
                contentDialogSubtopic &&
                editContent.mutate({
                  subtopicId: contentDialogSubtopic.id,
                  content: draftContent,
                })
              }
              disabled={editContent.isPending || !contentDialogSubtopic}
            >
              {editContent.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : null}
              Save content
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
