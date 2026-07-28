import { useAppStore, DashboardWidget, WidgetType } from '../../store';
import { ChartWidget } from './ChartWidget';

interface WidgetProps {
  widget: DashboardWidget;
}

export function Widget({ widget }: WidgetProps) {
  const tagState = useAppStore((state) => state.tags[widget.tag_id]);
  const removeWidget = useAppStore((state) => state.removeWidget);
  const updateWidgetType = useAppStore((state) => state.updateWidgetType);

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

  const isChart = widget.type === 'chart';

  const toggleType = () => {
    const next: WidgetType = isChart ? 'value' : 'chart';
    updateWidgetType(widget.id, next);
  };

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
      {/* Header row */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '0.75rem',
          paddingRight: '3.5rem',
        }}
      >
        <h3
          style={{
            fontSize: 'var(--font-size-sm)',
            margin: 0,
            color: 'var(--color-text-muted)',
            wordBreak: 'break-all',
          }}
        >
          {widget.tag_id}
        </h3>
      </div>

      {/* Control buttons */}
      <div
        style={{
          position: 'absolute',
          top: '0.5rem',
          right: '0.5rem',
          display: 'flex',
          gap: '4px',
        }}
      >
        <button
          onClick={toggleType}
          title={isChart ? 'Switch to value view' : 'Switch to chart view'}
          style={{
            background: 'var(--color-bg-active)',
            border: '1px solid var(--color-border)',
            color: 'var(--color-accent)',
            cursor: 'pointer',
            fontSize: '10px',
            borderRadius: 'var(--radius-sm)',
            padding: '2px 6px',
            lineHeight: 1.4,
          }}
        >
          {isChart ? '123' : '📈'}
        </button>
        <button
          onClick={() => removeWidget(widget.id)}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--color-text-muted)',
            cursor: 'pointer',
            fontSize: 'var(--font-size-md)',
            lineHeight: 1,
          }}
          title="Remove Widget"
        >
          ×
        </button>
      </div>

      {/* Body */}
      {isChart ? (
        <ChartWidget tagId={widget.tag_id} />
      ) : (
        <>
          <div
            style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', marginTop: 'auto' }}
          >
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
        </>
      )}
    </div>
  );
}
