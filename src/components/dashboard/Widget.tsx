import { useAppStore } from '../../store';
import { DashboardWidget } from '../../store';

interface WidgetProps {
  widget: DashboardWidget;
}

export function Widget({ widget }: WidgetProps) {
  const tagState = useAppStore((state) => state.tags[widget.tag_id]);
  const removeWidget = useAppStore((state) => state.removeWidget);

  // Formatting the value based on its type
  let displayValue = 'Waiting...';
  if (tagState && tagState.value) {
    if (
      tagState.value.type === 'Integer' ||
      tagState.value.type === 'Float' ||
      tagState.value.type === 'String'
    ) {
      displayValue = String(tagState.value.value);
    } else {
      displayValue = '[Raw Data]';
    }
  }

  const isGood = tagState?.quality?.status === 'Good';
  const isBad = tagState?.quality?.status === 'Bad';

  return (
    <div
      style={{
        background: 'var(--color-bg-sidebar)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-md)',
        padding: '1rem',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        minWidth: '200px',
        boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '1rem',
        }}
      >
        <h3
          style={{
            fontSize: 'var(--font-size-sm)',
            margin: 0,
            color: 'var(--color-text-muted)',
            wordBreak: 'break-all',
            paddingRight: '1rem',
          }}
        >
          {widget.tag_id}
        </h3>
        <button
          onClick={() => removeWidget(widget.id)}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--color-text-muted)',
            cursor: 'pointer',
            fontSize: 'var(--font-size-md)',
            position: 'absolute',
            top: '0.5rem',
            right: '0.5rem',
          }}
          title="Remove Widget"
        >
          ×
        </button>
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', marginTop: 'auto' }}>
        <span
          style={{
            fontSize: 'var(--font-size-xl)',
            fontWeight: 600,
            color: 'var(--color-text-main)',
          }}
        >
          {displayValue}
        </span>
      </div>

      {tagState && (
        <div
          style={{
            marginTop: '0.5rem',
            fontSize: 'var(--font-size-xs)',
            color: isGood ? '#4caf50' : isBad ? '#f44336' : '#9e9e9e',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
          }}
        >
          <span
            style={{
              display: 'inline-block',
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              backgroundColor: isGood ? '#4caf50' : isBad ? '#f44336' : '#9e9e9e',
            }}
          />
          {tagState.quality.status}
          {tagState.quality.status === 'Bad' &&
            'reason' in tagState.quality &&
            ` (${tagState.quality.reason})`}
        </div>
      )}
    </div>
  );
}
