import { Info } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TooltipInfoProps {
  content: React.ReactNode;
  className?: string;
}

export function TooltipInfo({ content, className }: TooltipInfoProps) {
  return (
    <div className={cn('relative flex items-center group/tooltip', className)}>
      <Info className="w-3 h-3 text-muted-foreground/70 hover:text-foreground cursor-help transition-colors" />

      {/* Tooltip Popup */}
      <div className="pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-full mb-1.5 opacity-0 group-hover/tooltip:opacity-100 transition-opacity duration-200 w-[max-content] max-w-[200px] px-2 py-1.5 bg-zinc-800 text-zinc-100 border border-zinc-700 text-[10px] font-normal rounded shadow-xl z-50 whitespace-normal leading-tight text-center">
        {content}
        {/* Triangle Arrow */}
        <div className="absolute left-1/2 -translate-x-1/2 top-full border-[4px] border-transparent border-t-zinc-800 z-10"></div>
        <div className="absolute left-1/2 -translate-x-1/2 top-full border-[5px] border-transparent border-t-zinc-700 -z-10 mt-[1px]"></div>
      </div>
    </div>
  );
}
