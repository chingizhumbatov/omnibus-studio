import React from 'react';
import * as Tooltip from '@radix-ui/react-tooltip';

export interface StatusBarItemProps {
  id: string;
  icon?: React.ReactNode;
  text?: string | number;
  tooltip?: string;
  onClick?: () => void;
  status?: 'default' | 'error' | 'warning' | 'success' | 'active';
}

interface StatusBarProps {
  children: React.ReactNode;
}

interface StatusBarSectionProps {
  children: React.ReactNode;
}

import { cn } from '@/lib/utils';

const getStatusColor = (status: StatusBarItemProps['status']) => {
  switch (status) {
    case 'error':
      return 'text-red-400';
    case 'warning':
      return 'text-yellow-400';
    case 'success':
      return 'text-emerald-400';
    case 'active':
      return 'text-blue-400';
    default:
      return '';
  }
};

const StatusBarItem: React.FC<StatusBarItemProps> = (props) => {
  const { icon, text, tooltip, onClick, status = 'default' } = props;

  const isClickable = !!onClick;

  const content = (
    <button
      onClick={onClick}
      disabled={!isClickable}
      className={cn(
        'flex items-center h-full px-1.5 transition-colors shrink-0 max-w-[250px]',
        isClickable ? 'cursor-pointer hover:bg-black/20' : 'cursor-default',
        getStatusColor(status),
      )}
    >
      {icon && (
        <span
          className={cn(
            'flex items-center justify-center shrink-0',
            text !== undefined && 'mr-1.5',
          )}
        >
          {icon}
        </span>
      )}
      {text !== undefined && <span className="truncate">{text}</span>}
    </button>
  );

  if (!tooltip) {
    return content;
  }

  return (
    <Tooltip.Provider delayDuration={500}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>{content}</Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            sideOffset={5}
            className="z-50 px-2 py-1 text-[10px] bg-zinc-800 text-zinc-100 border border-zinc-700 rounded shadow-md animate-in fade-in-0 zoom-in-95"
          >
            {tooltip}
            <Tooltip.Arrow className="fill-zinc-700" />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
};

const StatusBarLeft: React.FC<StatusBarSectionProps> = ({ children }) => {
  return <div className="flex items-center h-full space-x-1">{children}</div>;
};

const StatusBarRight: React.FC<StatusBarSectionProps> = ({ children }) => {
  return <div className="flex items-center h-full space-x-1">{children}</div>;
};

const StatusBarComponent: React.FC<StatusBarProps> = ({ children }) => {
  return (
    <div className="flex items-center justify-between h-[22px] px-1 bg-primary text-primary-foreground text-[10.5px] select-none z-50 overflow-hidden">
      {children}
    </div>
  );
};

export const StatusBar = Object.assign(StatusBarComponent, {
  Left: StatusBarLeft,
  Right: StatusBarRight,
  Item: StatusBarItem,
});
