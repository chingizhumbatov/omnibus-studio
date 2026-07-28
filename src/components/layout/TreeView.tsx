import { useState } from 'react';
import { useAppStore } from '../../store';
import { ConnectionConfig, DeviceInstance } from '../../core/contracts';

interface TreeNodeProps {
  label: string;
  statusIndicator?: 'good' | 'bad' | 'unknown' | 'none';
  defaultExpanded?: boolean;
  children?: React.ReactNode;
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent<HTMLDivElement>) => void;
}

function TreeNode({
  label,
  statusIndicator = 'none',
  defaultExpanded = false,
  draggable = false,
  onDragStart,
  children,
}: TreeNodeProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const hasChildren = !!children;

  return (
    <div style={{ marginLeft: '1rem' }}>
      <div
        draggable={draggable}
        onDragStart={onDragStart}
        style={{
          display: 'flex',
          alignItems: 'center',
          cursor: draggable ? 'grab' : hasChildren ? 'pointer' : 'default',
          padding: '0.25rem 0',
          color: 'var(--color-text-main)',
          userSelect: 'none',
        }}
        onClick={() => hasChildren && setExpanded(!expanded)}
      >
        <span
          style={{
            width: '16px',
            display: 'inline-block',
            textAlign: 'center',
            color: 'var(--color-text-muted)',
            fontSize: '0.7rem',
          }}
        >
          {hasChildren ? (expanded ? '▼' : '▶') : '•'}
        </span>

        {statusIndicator !== 'none' && (
          <span
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              marginRight: '6px',
              backgroundColor:
                statusIndicator === 'good'
                  ? '#4caf50'
                  : statusIndicator === 'bad'
                    ? '#f44336'
                    : '#9e9e9e',
            }}
          />
        )}

        <span style={{ fontSize: 'var(--font-size-sm)' }}>{label}</span>
      </div>

      {expanded && hasChildren && <div style={{ paddingLeft: '0.5rem' }}>{children}</div>}
    </div>
  );
}

function DeviceNode({ device }: { device: DeviceInstance }) {
  const tags = useAppStore((state) => state.tags);

  // Try to find tags belonging to this device.
  // We assume tag_id starts with device.instance_id.
  const deviceTags = Object.values(tags).filter((t) => t.tag_id.startsWith(device.instance_id));

  return (
    <TreeNode label={`Device: ${device.instance_id} (ID: ${device.slave_id})`} defaultExpanded>
      {deviceTags.length > 0 ? (
        deviceTags.map((tag) => (
          <TreeNode
            key={tag.tag_id}
            label={tag.tag_id}
            statusIndicator={
              tag.quality.status === 'Good'
                ? 'good'
                : tag.quality.status === 'Bad'
                  ? 'bad'
                  : 'unknown'
            }
            draggable={true}
            onDragStart={(e) => {
              e.dataTransfer.setData('text/plain', tag.tag_id);
              e.dataTransfer.effectAllowed = 'copy';
            }}
          />
        ))
      ) : (
        <TreeNode label="No tags" />
      )}
    </TreeNode>
  );
}

function ConnectionNode({ connection }: { connection: ConnectionConfig }) {
  const connectionStatuses = useAppStore((state) => state.connectionStatuses);
  const isConnected = connectionStatuses[connection.connection_id];

  const statusIndicator = isConnected === true ? 'good' : isConnected === false ? 'bad' : 'unknown';

  let typeLabel = 'Unknown';
  if (connection.connection_type.type === 'Tcp') {
    typeLabel = `TCP ${connection.connection_type.ip}:${connection.connection_type.port}`;
  } else if (connection.connection_type.type === 'Serial') {
    typeLabel = `Serial ${connection.connection_type.port}`;
  }

  return (
    <TreeNode
      label={`${connection.connection_id} [${typeLabel}]`}
      statusIndicator={statusIndicator}
      defaultExpanded
    >
      {connection.devices.length > 0 ? (
        connection.devices.map((device) => <DeviceNode key={device.instance_id} device={device} />)
      ) : (
        <TreeNode label="No devices" />
      )}
    </TreeNode>
  );
}

function DiscoveredTagsSection() {
  const tags = useAppStore((state) => state.tags);
  const setDraggedTagId = useAppStore((state) => state.setDraggedTagId);
  const allTags = Object.values(tags);

  return (
    <div style={{ marginTop: '1rem' }}>
      {/* Section separator */}
      <div
        style={{
          padding: '0 0.75rem',
          fontSize: 'var(--font-size-xs)',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          color: 'var(--color-text-muted)',
          fontWeight: 600,
          marginBottom: '0.25rem',
        }}
      >
        Discovered Tags
      </div>

      {allTags.length === 0 ? (
        <div
          style={{
            padding: '0.25rem 1.75rem',
            fontSize: 'var(--font-size-sm)',
            color: 'var(--color-text-muted)',
            fontStyle: 'italic',
          }}
        >
          Waiting for data...
        </div>
      ) : (
        allTags.map((tag) => (
          <div
            key={tag.tag_id}
            draggable={true}
            onDragStart={(e) => {
              // Write to store as primary mechanism (dataTransfer can be unreliable in Tauri WebView)
              setDraggedTagId(tag.tag_id);
              // Also set dataTransfer as fallback for browsers
              e.dataTransfer.setData('text/plain', tag.tag_id);
              e.dataTransfer.effectAllowed = 'copy';
            }}
            onDragEnd={() => {
              // Keep tag ID in store until drop fires; Dashboard will clear it
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '0.25rem 0.75rem',
              cursor: 'grab',
              userSelect: 'none',
              fontSize: 'var(--font-size-sm)',
              color: 'var(--color-text-main)',
              borderRadius: 'var(--radius-sm)',
              transition: 'background 0.1s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-bg-hover)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            <span
              style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                flexShrink: 0,
                backgroundColor:
                  tag.quality.status === 'Good'
                    ? '#4caf50'
                    : tag.quality.status === 'Bad'
                      ? '#f44336'
                      : '#9e9e9e',
              }}
            />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {tag.tag_id}
            </span>
          </div>
        ))
      )}
    </div>
  );
}

export function TreeView() {
  const workspace = useAppStore((state) => state.workspace);

  if (!workspace) {
    return (
      <div
        style={{
          padding: '1rem',
          fontSize: 'var(--font-size-sm)',
          color: 'var(--color-text-muted)',
        }}
      >
        No project open
      </div>
    );
  }

  return (
    <div style={{ padding: '0.5rem 0', overflowX: 'hidden' }}>
      <TreeNode label={`Workspace: ${workspace.session_id}`} defaultExpanded>
        {workspace.connections.map((conn) => (
          <ConnectionNode key={conn.connection_id} connection={conn} />
        ))}
      </TreeNode>

      <DiscoveredTagsSection />
    </div>
  );
}
