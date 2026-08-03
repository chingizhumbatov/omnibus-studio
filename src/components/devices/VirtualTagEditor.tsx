import { useUIStore } from '@/store/uiStore';
import { useDataStore } from '@/store/dataStore';
import { applyVirtualTags } from '@/core/api';
import { Calculator, Save, Trash2, Code2, Database, AlertCircle } from 'lucide-react';
import { useState, useEffect, useMemo } from 'react';
import { VirtualTagConfig } from '@/core/contracts';
import { cn } from '@/lib/utils';
import { TooltipInfo } from '@/components/ui/TooltipInfo';

export function VirtualTagEditor() {
  const {
    virtualTags,
    selectedVirtualTagId,
    updateVirtualTag,
    removeVirtualTag,
    setSelectedVirtualTag,
    editorIsDirty,
    setEditorDirty,
  } = useUIStore();

  const devices = useUIStore((state) => state.devices);

  const availableTags = useMemo(() => {
    const tags: { fullId: string; tagName: string; deviceName: string }[] = [];
    (devices || []).forEach((dev) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const config = dev.config as any;
      if (config && Array.isArray(config.tags)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        config.tags.forEach((tag: any) => {
          tags.push({
            fullId: tag.id,
            tagName: tag.name,
            deviceName: dev.name,
          });
        });
      }
    });
    return tags;
  }, [devices]);

  const availableTagIds = useMemo(
    () => new Set(availableTags.map((t) => t.fullId)),
    [availableTags],
  );

  const tag = (virtualTags || []).find((t) => t.id === selectedVirtualTagId);
  const [draft, setDraft] = useState<VirtualTagConfig | null>(null);
  const [isSaved, setIsSaved] = useState(false);

  // MUST BE BEFORE ANY EARLY RETURNS
  const liveTags = useDataStore((state) => state.tags);

  useEffect(() => {
    if (tag) {
      setDraft(JSON.parse(JSON.stringify(tag)));
    } else {
      setDraft(null);
    }
  }, [tag]);

  useEffect(() => {
    if (tag && draft) {
      const isDirty = JSON.stringify(tag) !== JSON.stringify(draft);
      setEditorDirty(isDirty);
    }
  }, [tag, draft, setEditorDirty]);

  useEffect(() => {
    return () => setEditorDirty(false);
  }, [setEditorDirty]);

  // Validation logic
  const validation = useMemo(() => {
    if (!draft) return { valid: true, errors: [] };

    const errors: string[] = [];
    const sourceKeys = Object.keys(draft.sources || {});

    // 1. Validate Sources
    sourceKeys.forEach((key) => {
      const sourceId = draft.sources[key];
      if (!sourceId) {
        errors.push(`Variable '${key}' has no source tag assigned.`);
      } else if (!availableTagIds.has(sourceId)) {
        errors.push(`Source tag '${sourceId}' for variable '${key}' does not exist.`);
      }
    });

    // 2. Validate Expression
    if (!draft.expression || draft.expression.trim() === '') {
      errors.push('Expression cannot be empty.');
    } else {
      // Check if expression uses undefined variables
      const wordRegex = /[a-zA-Z_][a-zA-Z0-9_]*/g;
      const matches = draft.expression.match(wordRegex) || [];
      const keywords = new Set([
        'true',
        'false',
        'and',
        'or',
        'not',
        'if',
        'else',
        'then',
        'sin',
        'cos',
        'tan',
        'sqrt',
        'abs',
      ]);

      matches.forEach((word) => {
        if (!sourceKeys.includes(word) && !keywords.has(word.toLowerCase())) {
          errors.push(`Variable '${word}' used in expression but not defined in sources.`);
        }
      });

      // Basic syntax check using JS eval (safe subset mock)
      let testExpr = draft.expression;
      sourceKeys.forEach((key) => {
        testExpr = testExpr.replace(new RegExp(`\\b${key}\\b`, 'g'), '1');
      });

      try {
        // Just a basic syntactical test. Math backend uses mexprp/rhai, so we just do a rough check.
        // We catch obvious syntax errors.
        // Replace known operators to valid JS for test
        testExpr = testExpr.replace(/and/gi, '&&').replace(/or/gi, '||').replace(/not/gi, '!');
        // eslint-disable-next-line no-new-func
        new Function('return ' + testExpr)();
      } catch (e: any) {
        errors.push(`Expression syntax error: ${e.message}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }, [draft, availableTagIds]);

  if (!tag || !draft) {
    return (
      <div className="h-full w-full flex items-center justify-center text-muted-foreground">
        Virtual Tag not found or deleted.
      </div>
    );
  }

  const handleSave = async () => {
    if (!draft) return;
    if (!validation.valid) {
      alert('Cannot save: Please fix validation errors first.');
      return;
    }
    updateVirtualTag(draft.id, draft);

    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2000);

    try {
      const updatedTags = useUIStore.getState().virtualTags;
      await applyVirtualTags(updatedTags);
    } catch (e) {
      console.error('Failed to apply virtual tags to backend:', e);
    }
  };

  const handleDelete = async () => {
    if (!draft) return;
    removeVirtualTag(draft.id);
    setSelectedVirtualTag(null);

    try {
      const updatedTags = useUIStore.getState().virtualTags;
      await applyVirtualTags(updatedTags);
    } catch (e) {
      console.error('Failed to apply virtual tags to backend:', e);
    }
  };

  const handleSourceChange = (varName: string, sourceTagId: string) => {
    if (!draft) return;
    setDraft({
      ...draft,
      sources: {
        ...(draft.sources || {}),
        [varName]: sourceTagId,
      },
    });
  };

  const handleAddSource = () => {
    if (!draft) return;
    const varName = `VAR_${Object.keys(draft.sources || {}).length + 1}`;
    setDraft({
      ...draft,
      sources: {
        ...(draft.sources || {}),
        [varName]: '',
      },
    });
  };

  const handleRemoveSource = (varName: string) => {
    if (!draft) return;
    const newSources = { ...(draft.sources || {}) };
    delete newSources[varName];
    setDraft({ ...draft, sources: newSources });
  };

  const hasSourceError = (sourceTagId: string) => {
    if (!sourceTagId) return true;
    return !availableTagIds.has(sourceTagId);
  };

  if (!tag || !draft) {
    return (
      <div className="h-full w-full flex items-center justify-center text-muted-foreground">
        Virtual Tag not found or deleted.
      </div>
    );
  }

  // Live value from the Data Hub for the currently saved tag
  const liveState = liveTags[draft.id];

  return (
    <div className="flex flex-col h-full bg-background overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border bg-card">
        <div className="flex items-center gap-4 min-w-0 flex-1 mr-4">
          <div className="flex items-center gap-1.5 min-w-0">
            <div className="p-1 bg-primary/10 rounded-md text-primary shrink-0">
              <Calculator className="w-3 h-3" />
            </div>
            <div className="min-w-0">
              <h2 className="text-[10px] font-semibold tracking-tight truncate">
                Virtual Tag Configuration
              </h2>
              <p className="text-[10px] text-muted-foreground truncate">ID: {draft.id}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 pl-4 border-l border-border h-6 shrink-0">
            <label className="flex items-center gap-1.5 cursor-pointer text-[10px] text-foreground font-medium uppercase tracking-wider">
              <input
                type="checkbox"
                className="w-3 h-3 rounded-sm cursor-pointer border-border accent-primary"
                checked={draft.enabled !== false}
                onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })}
              />
              Enabled
            </label>
          </div>

          {/* Live Preview */}
          <div className="flex items-center gap-2 pl-4 border-l border-border h-6 shrink-0">
            <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
              Live Value:
            </span>
            {liveState ? (
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-medium text-primary bg-primary/5 px-2 py-0.5 rounded border border-primary/20">
                  {liveState.value.type === 'Float'
                    ? (liveState.value.value as number).toFixed(3)
                    : String(liveState.value.value)}
                </span>
                <span
                  className={cn(
                    'text-[10px] font-medium px-1.5 py-0.5 rounded-full border',
                    liveState.quality.status === 'Good'
                      ? 'bg-green-500/10 text-green-500 border-green-500/20'
                      : liveState.quality.status === 'Bad'
                        ? 'bg-red-500/10 text-red-500 border-red-500/20'
                        : 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20',
                  )}
                >
                  {liveState.quality.status}
                </span>
              </div>
            ) : (
              <span className="text-[10px] text-zinc-500 italic">Not evaluated yet</span>
            )}
          </div>
        </div>
        <div className="flex gap-1.5 items-center shrink-0">
          {!validation.valid && (
            <div className="flex items-center gap-1 text-red-500 text-[10px] font-medium mr-2">
              <AlertCircle className="w-3 h-3" />
              {validation.errors.length} error(s)
            </div>
          )}
          <button
            onClick={handleDelete}
            className="flex items-center gap-1.5 px-3 py-1 text-[10px] font-medium text-red-500 hover:bg-red-500/10 rounded-md transition-colors"
          >
            <Trash2 className="w-3 h-3" /> Delete
          </button>
          <button
            onClick={handleSave}
            disabled={!validation.valid}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1 text-[10px] font-medium rounded-md transition-colors relative',
              isSaved
                ? 'bg-emerald-600 text-white'
                : 'bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50',
            )}
          >
            {!isSaved && editorIsDirty && validation.valid && (
              <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-yellow-500 border border-background"></span>
              </span>
            )}
            {isSaved ? <Save className="w-3 h-3" /> : <Save className="w-3 h-3" />}
            {isSaved ? 'Saved!' : 'Save Changes'}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-1">
        <div className="max-w-3xl mx-auto space-y-8 mt-2">
          {/* Validation Banner */}
          {!validation.valid && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-md p-3">
              <h4 className="text-red-500 text-xs font-semibold mb-2 flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4" /> Please fix the following errors:
              </h4>
              <ul className="list-disc list-inside text-[10px] text-red-400 space-y-1">
                {validation.errors.map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            </div>
          )}

          {/* General Settings */}
          <section className="space-y-4">
            <div className="flex items-center gap-1.5 pb-2 border-b border-border">
              <Database className="w-3 h-3 text-primary" />
              <h3 className="font-medium">General Settings</h3>
            </div>

            <div className="grid grid-cols-2 gap-1.5">
              <div className="space-y-1.5">
                <label className="flex items-center text-[10px] font-medium text-muted-foreground">
                  Tag Name
                  <TooltipInfo
                    className="ml-1.5"
                    content="Maximum length is 64 characters. Use a descriptive name."
                  />
                </label>
                <div className="relative">
                  <input
                    type="text"
                    maxLength={64}
                    value={draft.name}
                    onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                    className="w-full min-w-0 bg-secondary/50 border border-border rounded-md px-3 py-1 pr-10 text-[10px] focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  <span
                    className={cn(
                      'absolute right-2 top-1/2 -translate-y-1/2 text-[9px] pointer-events-none transition-colors',
                      draft.name.length >= 64
                        ? 'text-red-400 font-medium'
                        : 'text-muted-foreground/70',
                    )}
                  >
                    {draft.name.length}/64
                  </span>
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-medium text-muted-foreground">Data Type</label>
                <select
                  value={draft.data_type}
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  onChange={(e) => setDraft({ ...draft, data_type: e.target.value as any })}
                  className="w-full min-w-0 bg-secondary/50 border border-border rounded-md px-3 py-1 text-[10px] focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="Float32">Float32</option>
                  <option value="Float64">Float64</option>
                  <option value="Int32">Int32</option>
                  <option value="Int64">Int64</option>
                  <option value="Boolean">Boolean</option>
                  <option value="String">String</option>
                </select>
              </div>
            </div>
          </section>

          {/* Variables Mapping */}
          <section className="space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-border">
              <div className="flex items-center gap-1.5">
                <Code2 className="w-3 h-3 text-primary" />
                <h3 className="font-medium">Variables Mapping</h3>
              </div>
              <button
                onClick={handleAddSource}
                className="text-[10px] font-medium text-primary hover:text-primary/80"
              >
                + Add Variable
              </button>
            </div>

            <div className="space-y-3">
              {Object.entries(draft.sources || {}).map(([varName, sourceTagId]) => {
                const hasError = hasSourceError(sourceTagId);
                return (
                  <div
                    key={varName}
                    className={cn(
                      'flex items-center gap-1.5 p-1 rounded-md border',
                      hasError
                        ? 'bg-red-500/5 border-red-500/30'
                        : 'bg-secondary/30 border-border/50',
                    )}
                  >
                    <div className="space-y-1 flex-1">
                      <label className="text-[10px] font-medium text-muted-foreground">
                        Variable in Expression
                      </label>
                      <input
                        type="text"
                        value={varName}
                        onChange={(e) => {
                          const newName = e.target.value;
                          const newSources = { ...(draft.sources || {}) };
                          const val = newSources[varName];
                          delete newSources[varName];
                          newSources[newName] = val;
                          setDraft({ ...draft, sources: newSources });
                        }}
                        className="w-full min-w-0 bg-background border border-border rounded-md px-2 py-1 text-[10px]"
                        placeholder="e.g. T1"
                      />
                    </div>
                    <div className="space-y-1 flex-[2]">
                      <label className="text-[10px] font-medium text-muted-foreground">
                        Source Tag ID
                      </label>
                      <input
                        type="text"
                        list={`tag-list-${varName}`}
                        value={sourceTagId}
                        onChange={(e) => handleSourceChange(varName, e.target.value)}
                        className={cn(
                          'w-full bg-background border rounded-md px-2 py-1 text-[10px] focus:outline-none focus:ring-1 focus:ring-primary',
                          hasError
                            ? 'border-red-500/50 focus:border-red-500 focus:ring-red-500'
                            : 'border-border',
                        )}
                        placeholder="Search or type ID..."
                      />
                      <datalist id={`tag-list-${varName}`}>
                        {availableTags.map((t) => (
                          <option key={t.fullId} value={t.fullId}>
                            {t.deviceName} - {t.tagName}
                          </option>
                        ))}
                      </datalist>
                    </div>
                    <button
                      onClick={() => handleRemoveSource(varName)}
                      className="mt-5 p-1 text-muted-foreground hover:text-red-500 hover:bg-red-500/10 rounded-md transition-colors"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                );
              })}

              {Object.keys(draft.sources || {}).length === 0 && (
                <p className="text-[10px] text-muted-foreground italic text-center py-1.5">
                  No variables defined. Add a variable to use it in your expression.
                </p>
              )}
            </div>
          </section>

          {/* Expression */}
          <section className="space-y-4 pb-8">
            <div className="flex items-center gap-1.5 pb-2 border-b border-border">
              <Calculator className="w-3 h-3 text-primary" />
              <h3 className="font-medium">Expression</h3>
            </div>

            <div className="space-y-2">
              <textarea
                value={draft.expression}
                onChange={(e) => setDraft({ ...draft, expression: e.target.value })}
                rows={4}
                className={cn(
                  'w-full bg-secondary/50 border rounded-md px-3 py-1 font-mono text-[10px] focus:outline-none focus:ring-1 placeholder:text-muted-foreground/50',
                  validation.errors.some((e) => e.includes('Expression') || e.includes('Variable'))
                    ? 'border-red-500/50 focus:ring-red-500'
                    : 'border-border focus:ring-primary',
                )}
                placeholder="e.g. (T1 + T2) / 2"
              />
              <p className="text-[10px] text-muted-foreground">
                Enter an expression using the variables defined above. Supported operators: +, -, *,
                /, %, ^, ==, !=, &gt;, &lt;, &gt;=, &lt;=, &&, ||, !
              </p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
