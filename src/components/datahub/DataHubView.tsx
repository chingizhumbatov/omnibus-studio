import { useState } from 'react';
import { useDataStore } from '@/store/dataStore';
import { useUIStore } from '@/store/uiStore';
import { Search, Filter, RefreshCw, List, FolderTree } from 'lucide-react';
import { TagTable } from './TagTable';
import { TagTree } from './TagTree';
import { cn } from '@/lib/utils';

export function DataHubView() {
  const liveTags = useDataStore((state) => state.tags);
  const { channels, devices, virtualTags } = useUIStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [filterQuality, setFilterQuality] = useState<'all' | 'Good' | 'Bad' | 'Unknown'>('all');
  const [filterSource, setFilterSource] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'table' | 'tree'>('tree');

  // Generate a complete list of all tags known to the system
  const tagsArray: any[] = [];
  const knownTagIds = new Set<string>();
  const sources = new Set<string>();
  sources.add('Virtual');

  // 1. Add Physical Tags
  devices.forEach((device) => {
    sources.add(device.name);
    const channel = channels.find((c) => c.id === device.channelId);
    const channelName = channel ? channel.name : 'Unknown Channel';

    const config = device.config as any; // Cast to any to avoid type issues if ModbusDeviceConfig isn't imported
    if (config && config.tags) {
      config.tags.forEach((tag: any) => {
        const liveState = liveTags[tag.id];
        tagsArray.push({
          tag_id: tag.id,
          value: liveState?.value || { type: 'String', value: '—' },
          quality: liveState?.quality || { status: 'Unknown' },
          timestamp_ms: liveState?.timestamp_ms || 0,
          metadata: {
            name: tag.name || tag.id,
            source: device.name,
            dataType: tag.dataType,
            deviceId: device.id,
            channelId: device.channelId,
            channelName: channelName,
          },
        });
        knownTagIds.add(tag.id);
      });
    }
  });

  // 2. Add Virtual Tags
  virtualTags.forEach((vTag) => {
    const liveState = liveTags[vTag.id];
    tagsArray.push({
      tag_id: vTag.id,
      value: liveState?.value || { type: 'String', value: '—' },
      quality: liveState?.quality || { status: 'Unknown' },
      timestamp_ms: liveState?.timestamp_ms || 0,
      metadata: {
        name: vTag.name,
        source: 'Virtual',
        dataType: vTag.data_type,
        channelName: 'Virtual System',
      },
    });
    knownTagIds.add(vTag.id);
  });

  // 3. Add any "orphan" live tags that aren't in config
  Object.values(liveTags).forEach((liveState) => {
    if (!knownTagIds.has(liveState.tag_id)) {
      sources.add('Unknown');
      tagsArray.push({
        ...liveState,
        metadata: {
          name: liveState.tag_id,
          source: 'Unknown',
          dataType: 'Unknown',
          channelName: 'Unknown Channel',
        },
      });
    }
  });

  const filteredTags = tagsArray.filter((tag) => {
    const nameStr = tag.metadata.name || tag.tag_id;
    const matchesSearch =
      tag.tag_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      nameStr.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesQuality = filterQuality === 'all' || tag.quality.status === filterQuality;
    const matchesSource = filterSource === 'all' || tag.metadata.source === filterSource;
    return matchesSearch && matchesQuality && matchesSource;
  });

  return (
    <div className="flex flex-col h-full w-full bg-background text-foreground overflow-hidden">
      {/* Header / Toolbar */}
      <div className="flex items-center justify-between p-4 border-b border-border shrink-0 bg-card">
        <div>
          <h1 className="text-lg font-semibold flex items-center gap-2">
            <RefreshCw className="w-5 h-5 text-primary" />
            Data Hub
          </h1>
          <p className="text-xs text-muted-foreground mt-1">Live Tag Dictionary & State Viewer</p>
        </div>

        <div className="flex items-center gap-4">
          {/* View Toggle */}
          <div className="flex bg-background border border-border rounded-md p-0.5 shadow-sm">
            <button
              onClick={() => setViewMode('tree')}
              className={cn(
                'p-1.5 rounded text-xs transition-colors focus:outline-none flex items-center gap-1.5',
                viewMode === 'tree'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
              )}
              title="Tree View"
            >
              <FolderTree className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={cn(
                'p-1.5 rounded text-xs transition-colors focus:outline-none flex items-center gap-1.5',
                viewMode === 'table'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
              )}
              title="Table View"
            >
              <List className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search tags..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-4 py-1.5 bg-background border border-border rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-primary w-64"
            />
          </div>

          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-muted-foreground" />
            <select
              value={filterSource}
              onChange={(e) => setFilterSource(e.target.value)}
              className="bg-background border border-border rounded-md text-sm py-1.5 px-3 focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="all">All Sources</option>
              {Array.from(sources)
                .sort()
                .map((src) => (
                  <option key={src} value={src}>
                    {src}
                  </option>
                ))}
            </select>

            <select
              value={filterQuality}
              onChange={(e) => setFilterQuality(e.target.value as any)}
              className="bg-background border border-border rounded-md text-sm py-1.5 px-3 focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="all">All Qualities</option>
              <option value="Good">Good Only</option>
              <option value="Bad">Bad Only</option>
              <option value="Unknown">Unknown Only</option>
            </select>
          </div>
        </div>
      </div>

      {/* Main Table/Tree Area */}
      <div className="flex-1 overflow-hidden p-4">
        <div className="h-full rounded-md border border-border bg-card overflow-hidden flex flex-col">
          {viewMode === 'table' ? (
            <TagTable tags={filteredTags} />
          ) : (
            <TagTree tags={filteredTags} />
          )}
        </div>
      </div>
    </div>
  );
}
