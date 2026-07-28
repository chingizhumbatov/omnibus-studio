import { useAppStore } from '../../store';
import { Widget } from './Widget';
import React, { useState } from 'react';

export function Dashboard() {
  const widgets = useAppStore((state) => state.widgets);
  const addWidget = useAppStore((state) => state.addWidget);
  const draggedTagId = useAppStore((state) => state.draggedTagId);
  const setDraggedTagId = useAppStore((state) => state.setDraggedTagId);

  const [isDragOver, setIsDragOver] = useState(false);

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    if (!isDragOver) setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    // Only clear isDragOver when leaving the outer container, not its children
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragOver(false);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);

    // Primary: read from Zustand store (reliable in Tauri WebView)
    // Fallback: dataTransfer for standard browser environments
    const tagId = draggedTagId ?? e.dataTransfer.getData('text/plain');
    setDraggedTagId(null); // clear after consuming

    if (tagId) {
      addWidget(tagId, 'value');
    }
  };

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
      }}
    >
      <div style={{ padding: '0 0 1rem 0' }}>
        <h2 style={{ fontSize: 'var(--font-size-lg)', color: 'var(--color-text-main)', margin: 0 }}>
          Dashboard
        </h2>
        <p
          style={{
            color: 'var(--color-text-muted)',
            fontSize: 'var(--font-size-sm)',
            marginTop: '0.25rem',
          }}
        >
          Drag tags from the Explorer and drop them here to monitor live values.
        </p>
      </div>

      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        style={{
          flex: 1,
          backgroundColor: isDragOver ? 'var(--color-bg-hover)' : 'var(--color-bg-base)',
          border: isDragOver ? '2px dashed var(--color-accent)' : '2px dashed var(--color-border)',
          borderRadius: 'var(--radius-md)',
          padding: '1.5rem',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
          gap: '1.5rem',
          alignContent: 'start',
          transition: 'all 0.2s ease-in-out',
          overflowY: 'auto',
          minHeight: '200px',
        }}
      >
        {widgets.length === 0 ? (
          <div
            style={{
              gridColumn: '1 / -1',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--color-text-muted)',
              fontStyle: 'italic',
            }}
          >
            Drop tags here
          </div>
        ) : (
          widgets.map((widget) => <Widget key={widget.id} widget={widget} />)
        )}
      </div>
    </div>
  );
}
