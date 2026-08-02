import { useState, useMemo, useEffect } from 'react';
import { EnrichedTagState, renderValue, QualityBadge } from './TagTable';
import {
  ChevronRight,
  ChevronDown,
  Activity,
  Copy,
  Edit2,
  Check,
  Box,
  Tags,
  LayoutList,
} from 'lucide-react';
import { TagHistoryModal } from './TagHistoryModal';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { writeTag } from '@/core/api';
import { TagValue } from '@/core/contracts/ipc';

interface TagTreeProps {
  tags: EnrichedTagState[];
}

interface TreeData {
  [channelName: string]: {
    [deviceName: string]: EnrichedTagState[];
  };
}

export function TagTree({ tags }: TagTreeProps) {
  const [expandedChannels, setExpandedChannels] = useState<Record<string, boolean>>({});
  const [expandedDevices, setExpandedDevices] = useState<Record<string, boolean>>({});

  const [copiedId, setCopiedId] = useState<string | null>(null);

  // State for Write Dialog
  const [editingTag, setEditingTag] = useState<EnrichedTagState | null>(null);
  const [editValue, setEditValue] = useState('');
  const [isWriting, setIsWriting] = useState(false);
  const [writeError, setWriteError] = useState<string | null>(null);

  // State for History Modal
  const [historyTagId, setHistoryTagId] = useState<string | null>(null);

  // Group tags by Channel -> Device
  const treeData = useMemo(() => {
    const data: TreeData = {};

    tags.forEach((tag) => {
      const chName = tag.metadata.channelName || 'Unknown Channel';
      const devName = tag.metadata.source || 'Unknown Device';

      if (!data[chName]) {
        data[chName] = {};
      }
      if (!data[chName][devName]) {
        data[chName][devName] = [];
      }
      data[chName][devName].push(tag);
    });

    // Sort channels, devices, and tags
    const sortedData: TreeData = {};
    Object.keys(data)
      .sort()
      .forEach((chName) => {
        sortedData[chName] = {};
        Object.keys(data[chName])
          .sort()
          .forEach((devName) => {
            sortedData[chName][devName] = data[chName][devName].sort((a, b) => {
              const nameA = a.metadata.name || a.tag_id;
              const nameB = b.metadata.name || b.tag_id;
              return nameA.localeCompare(nameB);
            });
          });
      });

    return sortedData;
  }, [tags]);

  // Expand all by default when treeData changes (only for new nodes)
  useEffect(() => {
    const newExpCh: Record<string, boolean> = {};
    const newExpDev: Record<string, boolean> = {};
    Object.keys(treeData).forEach((ch) => {
      newExpCh[ch] = true;
      Object.keys(treeData[ch]).forEach((dev) => {
        newExpDev[`${ch}::${dev}`] = true;
      });
    });
    setExpandedChannels((prev) => ({ ...newExpCh, ...prev }));
    setExpandedDevices((prev) => ({ ...newExpDev, ...prev }));
  }, [treeData]);

  const toggleChannel = (ch: string) => {
    setExpandedChannels((prev) => ({ ...prev, [ch]: !prev[ch] }));
  };

  const toggleDevice = (ch: string, dev: string) => {
    const key = `${ch}::${dev}`;
    setExpandedDevices((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleCopyId = (tagId: string) => {
    navigator.clipboard.writeText(tagId);
    setCopiedId(tagId);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleOpenWriteDialog = (tag: EnrichedTagState) => {
    if (tag.metadata.source === 'Virtual') return;
    setEditingTag(tag);
    setEditValue(String(tag.value.value));
    setWriteError(null);
  };

  const handleWriteSubmit = async () => {
    if (!editingTag || !editingTag.metadata.channelId || !editingTag.metadata.deviceId) return;

    setIsWriting(true);
    setWriteError(null);

    let val: TagValue;
    const dataType = editingTag.metadata.dataType.toLowerCase();

    if (dataType === 'float32' || dataType === 'float64') {
      val = { type: 'Float', value: parseFloat(editValue) };
    } else if (dataType === 'bool') {
      val = {
        type: 'Integer',
        value: editValue.toLowerCase() === 'true' || editValue === '1' ? 1 : 0,
      };
    } else {
      val = { type: 'Integer', value: parseInt(editValue, 10) };
    }

    try {
      await writeTag(
        editingTag.metadata.channelId,
        editingTag.metadata.deviceId,
        editingTag.tag_id,
        val,
      );
      setEditingTag(null);
    } catch (e: any) {
      setWriteError(e.message || String(e));
    } finally {
      setIsWriting(false);
    }
  };

  if (tags.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
        No tags found
      </div>
    );
  }

  return (
    <div className="w-full h-full overflow-auto bg-card">
      <div className="p-2 space-y-1">
        {Object.entries(treeData).map(([chName, devices]) => (
          <div key={chName} className="flex flex-col">
            {/* Channel Node */}
            <div
              className="flex items-center gap-2 py-1.5 px-2 hover:bg-secondary/50 rounded-md cursor-pointer select-none text-sm font-medium text-foreground/90"
              onClick={() => toggleChannel(chName)}
            >
              {expandedChannels[chName] ? (
                <ChevronDown className="w-4 h-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              )}
              <LayoutList className="w-4 h-4 text-primary" />
              {chName}
            </div>

            {/* Devices */}
            {expandedChannels[chName] && (
              <div className="flex flex-col ml-6 pl-2 border-l border-border/50">
                {Object.entries(devices).map(([devName, devTags]) => (
                  <div key={`${chName}::${devName}`} className="flex flex-col mt-1">
                    {/* Device Node */}
                    <div
                      className="flex items-center gap-2 py-1 px-2 hover:bg-secondary/50 rounded-md cursor-pointer select-none text-xs font-medium text-foreground/80"
                      onClick={() => toggleDevice(chName, devName)}
                    >
                      {expandedDevices[`${chName}::${devName}`] ? (
                        <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                      )}
                      <Box className="w-3.5 h-3.5 text-blue-500" />
                      {devName}
                      <span className="text-[10px] text-muted-foreground ml-2 px-1.5 py-0.5 bg-secondary rounded-full">
                        {devTags.length}
                      </span>
                    </div>

                    {/* Tags */}
                    {expandedDevices[`${chName}::${devName}`] && (
                      <div className="flex flex-col ml-5 mt-1 border-l border-border/30">
                        {devTags.map((tag) => (
                          <div
                            key={tag.tag_id}
                            className="flex items-center justify-between py-1 px-3 hover:bg-secondary/30 rounded-md group text-xs transition-colors"
                          >
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                              <Tags className="w-3 h-3 text-zinc-500 shrink-0" />
                              <div className="flex flex-col min-w-0">
                                <span className="font-medium text-foreground truncate">
                                  {tag.metadata.name}
                                </span>
                                {tag.metadata.name !== tag.tag_id && (
                                  <span className="text-[9px] text-muted-foreground font-mono truncate">
                                    {tag.tag_id}
                                  </span>
                                )}
                              </div>
                            </div>

                            <div className="flex items-center gap-4 shrink-0">
                              <div className="w-24 text-right">
                                <span className="text-[10px] font-mono text-muted-foreground mr-2">
                                  {tag.metadata.dataType}
                                </span>
                                <span
                                  className="font-mono font-medium text-primary cursor-pointer hover:underline"
                                  onDoubleClick={() => handleOpenWriteDialog(tag)}
                                >
                                  {renderValue(tag.value)}
                                </span>
                              </div>
                              <div className="w-24 flex justify-end">
                                <QualityBadge quality={tag.quality} />
                              </div>
                              <div className="w-20 text-right text-[10px] text-muted-foreground tabular-nums">
                                {tag.timestamp_ms > 0
                                  ? new Date(tag.timestamp_ms).toISOString().slice(11, 23)
                                  : '—'}
                              </div>
                              <div className="w-24 flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                  onClick={() => setHistoryTagId(tag.tag_id)}
                                  className="p-1 text-muted-foreground hover:text-primary hover:bg-secondary rounded-md transition-colors"
                                  title="Quick Trend"
                                >
                                  <Activity className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => handleCopyId(tag.tag_id)}
                                  className="p-1 text-muted-foreground hover:text-primary hover:bg-secondary rounded-md transition-colors"
                                  title="Copy Tag ID"
                                >
                                  {copiedId === tag.tag_id ? (
                                    <Check className="w-3.5 h-3.5 text-emerald-500" />
                                  ) : (
                                    <Copy className="w-3.5 h-3.5" />
                                  )}
                                </button>
                                <button
                                  onClick={() => handleOpenWriteDialog(tag)}
                                  className="p-1 text-muted-foreground hover:text-primary hover:bg-secondary rounded-md transition-colors disabled:opacity-50"
                                  title="Write Value"
                                  disabled={
                                    tag.metadata.source === 'Virtual' || !tag.metadata.channelId
                                  }
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      <Dialog open={!!editingTag} onOpenChange={(open) => !open && setEditingTag(null)}>
        <DialogContent className="sm:max-w-[425px] bg-[#111116] border-zinc-800">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold text-zinc-200">
              Write Tag Value
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="flex flex-col gap-1">
              <span className="text-[10px] text-zinc-500 uppercase tracking-wider">Target Tag</span>
              <span className="text-xs font-mono text-zinc-300 bg-zinc-900/50 px-2 py-1 rounded border border-zinc-800/50">
                {editingTag?.tag_id}
              </span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[10px] text-zinc-500 uppercase tracking-wider">Data Type</span>
              <span className="text-xs font-mono text-zinc-400">
                {editingTag?.metadata.dataType}
              </span>
            </div>
            <div className="flex flex-col gap-2">
              <label
                htmlFor="tree-value-input"
                className="text-[10px] text-zinc-500 uppercase tracking-wider"
              >
                New Value
              </label>
              <input
                id="tree-value-input"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleWriteSubmit();
                }}
                className="flex h-9 w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-1 text-sm shadow-sm transition-colors focus:outline-none focus:ring-1 focus:ring-primary text-zinc-200"
                autoFocus
              />
              {writeError && <span className="text-[10px] text-red-500 mt-1">{writeError}</span>}
            </div>
          </div>
          <DialogFooter>
            <button
              onClick={() => setEditingTag(null)}
              className="px-4 py-2 text-xs font-medium text-zinc-400 hover:text-zinc-200 transition-colors"
              disabled={isWriting}
            >
              Cancel
            </button>
            <button
              onClick={handleWriteSubmit}
              disabled={isWriting}
              className="px-4 py-2 text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 rounded-md transition-colors disabled:opacity-50"
            >
              {isWriting ? 'Writing...' : 'Write Value'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <TagHistoryModal tagId={historyTagId} onClose={() => setHistoryTagId(null)} />
    </div>
  );
}
