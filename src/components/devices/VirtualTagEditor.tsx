import { useUIStore } from "@/store/uiStore";
import { Calculator, Save, Trash2, Code2, Database } from "lucide-react";
import { useState, useEffect, useMemo } from "react";
import { VirtualTagConfig } from "@/core/contracts";

export function VirtualTagEditor() {
  const { virtualTags, selectedVirtualTagId, updateVirtualTag, removeVirtualTag, setSelectedVirtualTag } = useUIStore();
  
  const devices = useUIStore(state => state.devices);
  
  const availableTags = useMemo(() => {
    const tags: { fullId: string, tagName: string, deviceName: string }[] = [];
    (devices || []).forEach(dev => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const config = dev.config as any;
      if (config && Array.isArray(config.tags)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        config.tags.forEach((tag: any) => {
          tags.push({
            fullId: tag.id,
            tagName: tag.name,
            deviceName: dev.name
          });
        });
      }
    });
    return tags;
  }, [devices]);

  const tag = (virtualTags || []).find(t => t.id === selectedVirtualTagId);
  const [draft, setDraft] = useState<VirtualTagConfig | null>(null);

  useEffect(() => {
    if (tag) {
      // Create a deep copy for the draft
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDraft(JSON.parse(JSON.stringify(tag)));
    } else {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDraft(null);
    }
  }, [tag]);

  if (!tag || !draft) {
    return (
      <div className="h-full w-full flex items-center justify-center text-muted-foreground">
        Virtual Tag not found or deleted.
      </div>
    );
  }

  const handleSave = () => {
    updateVirtualTag(draft.id, draft);
    // Optionally trigger an IPC call here to send to backend Data Hub immediately,
    // or rely on a global "Save Workspace" button if the user prefers.
  };

  const handleDelete = () => {
    removeVirtualTag(draft.id);
    setSelectedVirtualTag(null);
  };

  const handleSourceChange = (varName: string, sourceTagId: string) => {
    setDraft({
      ...draft,
      sources: {
        ...(draft.sources || {}),
        [varName]: sourceTagId,
      }
    });
  };

  const handleAddSource = () => {
    const varName = `VAR_${Object.keys(draft.sources || {}).length + 1}`;
    setDraft({
      ...draft,
      sources: {
        ...(draft.sources || {}),
        [varName]: "",
      }
    });
  };

  const handleRemoveSource = (varName: string) => {
    const newSources = { ...(draft.sources || {}) };
    delete newSources[varName];
    setDraft({ ...draft, sources: newSources });
  };

  return (
    <div className="flex flex-col h-full bg-background overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-card">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-md text-primary">
            <Calculator className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Virtual Tag Configuration</h2>
            <p className="text-sm text-muted-foreground">ID: {draft.id}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={handleDelete}
            className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-red-500 hover:bg-red-500/10 rounded-md transition-colors"
          >
            <Trash2 className="w-4 h-4" /> Delete
          </button>
          <button 
            onClick={handleSave}
            className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 rounded-md transition-colors"
          >
            <Save className="w-4 h-4" /> Save Changes
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-3xl mx-auto space-y-8">
          
          {/* General Settings */}
          <section className="space-y-4">
            <div className="flex items-center gap-2 pb-2 border-b border-border">
              <Database className="w-4 h-4 text-primary" />
              <h3 className="font-medium">General Settings</h3>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-muted-foreground">Tag Name</label>
                <input 
                  type="text" 
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  className="w-full bg-secondary/50 border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-muted-foreground">Data Type</label>
                <select
                  value={draft.data_type}
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  onChange={(e) => setDraft({ ...draft, data_type: e.target.value as any })}
                  className="w-full bg-secondary/50 border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
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
              <div className="flex items-center gap-2">
                <Code2 className="w-4 h-4 text-primary" />
                <h3 className="font-medium">Variables Mapping</h3>
              </div>
              <button 
                onClick={handleAddSource}
                className="text-xs font-medium text-primary hover:text-primary/80"
              >
                + Add Variable
              </button>
            </div>
            
            <div className="space-y-3">
              {Object.entries(draft.sources || {}).map(([varName, sourceTagId]) => (
                <div key={varName} className="flex items-center gap-3 bg-secondary/30 p-3 rounded-md border border-border/50">
                  <div className="space-y-1 flex-1">
                    <label className="text-xs font-medium text-muted-foreground">Variable in Expression</label>
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
                      className="w-full bg-background border border-border rounded-md px-2 py-1.5 text-sm"
                      placeholder="e.g. T1"
                    />
                  </div>
                  <div className="space-y-1 flex-[2]">
                    <label className="text-xs font-medium text-muted-foreground">Source Tag ID</label>
                    <input 
                      type="text"
                      list={`tag-list-${varName}`}
                      value={sourceTagId}
                      onChange={(e) => handleSourceChange(varName, e.target.value)}
                      className="w-full bg-background border border-border rounded-md px-2 py-1.5 text-sm"
                      placeholder="Search or type ID..."
                    />
                    <datalist id={`tag-list-${varName}`}>
                      {availableTags.map(t => (
                        <option key={t.fullId} value={t.fullId}>
                          {t.deviceName} - {t.tagName}
                        </option>
                      ))}
                    </datalist>
                  </div>
                  <button 
                    onClick={() => handleRemoveSource(varName)}
                    className="mt-5 p-1.5 text-muted-foreground hover:text-red-500 hover:bg-red-500/10 rounded-md transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
              
              {Object.keys(draft.sources || {}).length === 0 && (
                <p className="text-sm text-muted-foreground italic text-center py-4">
                  No variables defined. Add a variable to use it in your expression.
                </p>
              )}
            </div>
          </section>

          {/* Expression */}
          <section className="space-y-4">
            <div className="flex items-center gap-2 pb-2 border-b border-border">
              <Calculator className="w-4 h-4 text-primary" />
              <h3 className="font-medium">Expression</h3>
            </div>
            
            <div className="space-y-2">
              <textarea 
                value={draft.expression}
                onChange={(e) => setDraft({ ...draft, expression: e.target.value })}
                rows={4}
                className="w-full bg-secondary/50 border border-border rounded-md px-4 py-3 font-mono text-sm focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground/50"
                placeholder="e.g. (T1 + T2) / 2"
              />
              <p className="text-xs text-muted-foreground">
                Enter an expression using the variables defined above. Supported operators: +, -, *, /, %, ^, ==, !=, &gt;, &lt;, &gt;=, &lt;=, &&, ||, !
              </p>
            </div>
          </section>

        </div>
      </div>
    </div>
  );
}
