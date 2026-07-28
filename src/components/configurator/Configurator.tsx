/* eslint-disable react-hooks/set-state-in-effect */
import { useState, useEffect } from 'react';
import { useAppStore } from '../../store';
import { WorkspaceSession } from '../../core/contracts';
import { invoke } from '@tauri-apps/api/core';
import { loadWorkspace } from '../../core/api';

export function Configurator() {
  const currentWorkspace = useAppStore((state) => state.workspace);
  const setWorkspace = useAppStore((state) => state.setWorkspace);

  // Local state for editing before applying
  const [draftSession, setDraftSession] = useState<WorkspaceSession | null>(null);

  useEffect(() => {
     
    if (currentWorkspace) {
      setDraftSession(JSON.parse(JSON.stringify(currentWorkspace))); // Deep copy
    } else {
      setDraftSession({
        session_id: `session_${Date.now()}`,
        ui_throttle_ms: 100,
        connections: [],
        profiles: [],
      });
    }
  }, [currentWorkspace]);

  const handleSaveAndApply = async () => {
    if (!draftSession) return;
    try {
      // 1. Save to disk via Tauri IPC
      await invoke('save_session', { session: draftSession });

      // 2. Load into Rust backend
      await loadWorkspace(draftSession);

      // 3. Update Frontend Store
      setWorkspace(draftSession);
      alert('Configuration applied successfully!');
    } catch (err) {
      console.error(err);
      alert('Failed to apply configuration: ' + err);
    }
  };

  if (!draftSession) return <div>Loading configurator...</div>;

  return (
    <div
      className="configurator-container"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        gap: '1rem',
        color: '#fff',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ margin: 0, fontWeight: 500 }}>Workspace Configurator</h2>
          <span style={{ fontSize: '14px', color: '#888' }}>ID: {draftSession.session_id}</span>
        </div>
        <button
          onClick={handleSaveAndApply}
          style={{
            background: '#10a37f',
            color: '#fff',
            border: 'none',
            padding: '8px 16px',
            borderRadius: '4px',
            cursor: 'pointer',
            fontWeight: 500,
          }}
        >
          Save & Apply
        </button>
      </div>

      <div style={{ display: 'flex', flex: 1, gap: '1rem', overflow: 'hidden' }}>
        {/* Connections Column */}
        <div
          style={{
            flex: 1,
            background: '#1e1e1e',
            borderRadius: '8px',
            padding: '1rem',
            overflowY: 'auto',
          }}
        >
          <h3 style={{ marginTop: 0, color: '#ccc' }}>Connections</h3>
          {draftSession.connections.map((c, i) => (
            <div
              key={i}
              style={{
                padding: '8px',
                background: '#2a2a2a',
                marginBottom: '8px',
                borderRadius: '4px',
              }}
            >
              <strong>{c.connection_id}</strong>
              <div style={{ fontSize: '12px', color: '#aaa' }}>Type: {c.connection_type.type}</div>
            </div>
          ))}
          <button
            style={{
              width: '100%',
              padding: '8px',
              background: '#333',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            + Add Connection
          </button>
        </div>

        {/* Devices Column */}
        <div
          style={{
            flex: 1,
            background: '#1e1e1e',
            borderRadius: '8px',
            padding: '1rem',
            overflowY: 'auto',
          }}
        >
          <h3 style={{ marginTop: 0, color: '#ccc' }}>Devices (Profiles)</h3>
          {draftSession.profiles.map((p, i) => (
            <div
              key={i}
              style={{
                padding: '8px',
                background: '#2a2a2a',
                marginBottom: '8px',
                borderRadius: '4px',
              }}
            >
              <strong>{p.name}</strong>
              <div style={{ fontSize: '12px', color: '#aaa' }}>Tags: {p.tags.length}</div>
            </div>
          ))}
          <button
            style={{
              width: '100%',
              padding: '8px',
              background: '#333',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            + Add Profile
          </button>
        </div>

        {/* Editor Column */}
        <div
          style={{
            flex: 2,
            background: '#1e1e1e',
            borderRadius: '8px',
            padding: '1rem',
            overflowY: 'auto',
          }}
        >
          <h3 style={{ marginTop: 0, color: '#ccc' }}>Raw JSON Editor</h3>
          <textarea
            style={{
              width: '100%',
              height: 'calc(100% - 40px)',
              background: '#111',
              color: '#10a37f',
              border: '1px solid #333',
              padding: '10px',
              fontFamily: 'monospace',
            }}
            value={JSON.stringify(draftSession, null, 2)}
            onChange={(e) => {
              try {
                const parsed = JSON.parse(e.target.value);
                setDraftSession(parsed);
              } catch {
                // Ignore parse errors while typing
              }
            }}
          />
        </div>
      </div>
    </div>
  );
}
