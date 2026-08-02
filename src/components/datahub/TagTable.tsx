import { useState, useMemo } from 'react';
import { TagState, TagValue, TagQuality } from '@/core/contracts/ipc';
import {
  CheckCircle2,
  XCircle,
  AlertCircle,
  Edit2,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Copy,
  Check,
  Activity,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { writeTag } from '@/core/api';
import { TagHistoryModal } from './TagHistoryModal';

export type EnrichedTagState = TagState & {
  metadata: {
    name: string;
    source: string;
    dataType: string;
    deviceId?: string;
    channelId?: string;
    channelName?: string;
  };
};

interface TagTableProps {
  tags: EnrichedTagState[];
}

export function renderValue(val: TagValue) {
  if (val.type === 'Float') {
    return (val.value as number).toFixed(2);
  }
  if (val.type === 'Raw') {
    return '[Raw Data]';
  }
  return String(val.value);
}

export function QualityBadge({ quality }: { quality: TagQuality }) {
  if (quality.status === 'Good') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium bg-green-500/10 text-green-500 border border-green-500/20">
        <CheckCircle2 className="w-3 h-3" />
        Good
      </span>
    );
  }
  if (quality.status === 'Bad') {
    return (
      <span
        className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium bg-red-500/10 text-red-500 border border-red-500/20"
        title={quality.reason}
      >
        <XCircle className="w-3 h-3" />
        Bad
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium bg-zinc-500/10 text-zinc-400 border border-zinc-500/20">
      <AlertCircle className="w-3 h-3" />
      Unknown
    </span>
  );
}

export function TagTable({ tags }: TagTableProps) {
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(
    null,
  );
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // State for Write Dialog
  const [editingTag, setEditingTag] = useState<EnrichedTagState | null>(null);
  const [editValue, setEditValue] = useState('');
  const [isWriting, setIsWriting] = useState(false);
  const [writeError, setWriteError] = useState<string | null>(null);

  // State for History Modal
  const [historyTagId, setHistoryTagId] = useState<string | null>(null);

  const sortedTags = useMemo(() => {
    let sortableTags = [...tags];
    if (sortConfig !== null) {
      sortableTags.sort((a, b) => {
        let aVal: any;
        let bVal: any;

        switch (sortConfig.key) {
          case 'name':
            aVal = a.metadata.name.toLowerCase();
            bVal = b.metadata.name.toLowerCase();
            break;
          case 'source':
            aVal = a.metadata.source.toLowerCase();
            bVal = b.metadata.source.toLowerCase();
            break;
          case 'type':
            aVal = a.metadata.dataType.toLowerCase();
            bVal = b.metadata.dataType.toLowerCase();
            break;
          case 'value':
            aVal = typeof a.value.value === 'string' ? a.value.value.toLowerCase() : a.value.value;
            bVal = typeof b.value.value === 'string' ? b.value.value.toLowerCase() : b.value.value;
            break;
          case 'quality':
            aVal = a.quality.status;
            bVal = b.quality.status;
            break;
          case 'timestamp':
            aVal = a.timestamp_ms;
            bVal = b.timestamp_ms;
            break;
          default:
            return 0;
        }

        if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }
    return sortableTags;
  }, [tags, sortConfig]);

  const requestSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const SortIcon = ({ columnKey }: { columnKey: string }) => {
    if (!sortConfig || sortConfig.key !== columnKey) {
      return (
        <ArrowUpDown className="w-3 h-3 ml-1 opacity-20 group-hover:opacity-100 transition-opacity" />
      );
    }
    return sortConfig.direction === 'asc' ? (
      <ArrowUp className="w-3 h-3 ml-1 text-primary" />
    ) : (
      <ArrowDown className="w-3 h-3 ml-1 text-primary" />
    );
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

  const thClass =
    'px-4 py-3 font-medium cursor-pointer hover:bg-secondary/70 transition-colors group select-none';

  return (
    <>
      <div className="w-full h-full overflow-auto">
        <table className="w-full text-sm text-left">
          <thead className="text-xs text-muted-foreground uppercase bg-secondary/50 sticky top-0 z-10 shadow-sm">
            <tr>
              <th className={thClass} onClick={() => requestSort('name')}>
                <div className="flex items-center">
                  Tag ID / Name <SortIcon columnKey="name" />
                </div>
              </th>
              <th className={thClass} onClick={() => requestSort('source')}>
                <div className="flex items-center">
                  Source <SortIcon columnKey="source" />
                </div>
              </th>
              <th className={thClass} onClick={() => requestSort('type')}>
                <div className="flex items-center">
                  Type <SortIcon columnKey="type" />
                </div>
              </th>
              <th className={thClass} onClick={() => requestSort('value')}>
                <div className="flex items-center">
                  Value <SortIcon columnKey="value" />
                </div>
              </th>
              <th className={thClass} onClick={() => requestSort('quality')}>
                <div className="flex items-center">
                  Quality <SortIcon columnKey="quality" />
                </div>
              </th>
              <th className={thClass} onClick={() => requestSort('timestamp')}>
                <div className="flex items-center">
                  Last Update <SortIcon columnKey="timestamp" />
                </div>
              </th>
              <th className="px-4 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {sortedTags.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                  No tags found
                </td>
              </tr>
            ) : (
              sortedTags.map((tag) => (
                <tr key={tag.tag_id} className="hover:bg-secondary/30 transition-colors group">
                  <td className="px-4 py-2">
                    <div className="font-medium text-foreground">{tag.metadata.name}</div>
                    {tag.metadata.name !== tag.tag_id && (
                      <div className="text-[10px] text-muted-foreground font-mono">
                        {tag.tag_id}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <span
                      className={cn(
                        'px-2 py-0.5 rounded text-[10px] font-medium',
                        tag.metadata.source === 'Virtual'
                          ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                          : 'bg-blue-500/10 text-blue-400 border border-blue-500/20',
                      )}
                    >
                      {tag.metadata.source}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-muted-foreground text-xs font-mono">
                    {tag.metadata.dataType}
                  </td>
                  <td
                    className="px-4 py-2 cursor-pointer"
                    onDoubleClick={() => handleOpenWriteDialog(tag)}
                  >
                    <div className="font-mono font-medium text-primary">
                      {renderValue(tag.value)}
                    </div>
                  </td>
                  <td className="px-4 py-2">
                    <QualityBadge quality={tag.quality} />
                  </td>
                  <td className="px-4 py-2 text-xs text-muted-foreground tabular-nums">
                    {tag.timestamp_ms > 0
                      ? new Date(tag.timestamp_ms).toISOString().slice(11, 23)
                      : '—'}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => setHistoryTagId(tag.tag_id)}
                        className="p-1.5 text-muted-foreground hover:text-primary hover:bg-secondary rounded-md transition-colors"
                        title="Quick Trend (History)"
                      >
                        <Activity className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleCopyId(tag.tag_id)}
                        className="p-1.5 text-muted-foreground hover:text-primary hover:bg-secondary rounded-md transition-colors"
                        title="Copy Tag ID"
                      >
                        {copiedId === tag.tag_id ? (
                          <Check className="w-4 h-4 text-emerald-500" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                      </button>
                      <button
                        onClick={() => handleOpenWriteDialog(tag)}
                        className="p-1.5 text-muted-foreground hover:text-primary hover:bg-secondary rounded-md transition-colors disabled:opacity-50 disabled:hover:text-muted-foreground disabled:hover:bg-transparent"
                        title="Write Value"
                        disabled={tag.metadata.source === 'Virtual' || !tag.metadata.channelId}
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
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
              <label htmlFor="value" className="text-[10px] text-zinc-500 uppercase tracking-wider">
                New Value
              </label>
              <input
                id="value"
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
    </>
  );
}
