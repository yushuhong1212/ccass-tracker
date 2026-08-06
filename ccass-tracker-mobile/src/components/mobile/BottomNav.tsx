/**
 * BottomNav — 固定底部的双 Tab 导航栏（金融科技风格）。
 * 带滑动指示器动画，微交互反馈。
 */
import { LayoutDashboard, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useMemo } from 'react';

export type MobileTab = 'stock' | 'scanner';

interface BottomNavProps {
  active: MobileTab;
  onChange: (tab: MobileTab) => void;
}

const TABS: { id: MobileTab; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'stock', label: '个股持仓', icon: LayoutDashboard },
  { id: 'scanner', label: '多股扫描', icon: Search },
];

export function BottomNav({ active, onChange }: BottomNavProps) {
  const indicatorStyle = useMemo(() => {
    const idx = TABS.findIndex(t => t.id === active);
    const width = 100 / TABS.length;
    return {
      left: `${idx * width}%`,
      width: `${width}%`,
    };
  }, [active]);

  return (
    <nav
      className="fixed bottom-0 left-1/2 -translate-x-1/2 z-30 w-full max-w-[480px]
                 border-t border-border/50 bg-card/80 backdrop-blur-xl safe-bottom"
    >
      <div className="relative flex">
        {/* 滑动指示器 */}
        <div className="tab-indicator" style={indicatorStyle} />

        {TABS.map(({ id, label, icon: Icon }) => {
          const isActive = active === id;
          return (
            <button
              key={id}
              onClick={() => onChange(id)}
              className={cn(
                'tap-target flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5 transition-all duration-200 relative',
                isActive ? 'text-primary' : 'text-muted-foreground',
              )}
            >
              <Icon
                className={cn(
                  'w-5 h-5 transition-all duration-200',
                  isActive && 'scale-110',
                )}
                strokeWidth={isActive ? 2.5 : 1.5}
              />
              <span className={cn(
                'text-[10px] font-medium tracking-wide transition-all duration-200',
                isActive ? 'opacity-100' : 'opacity-60',
              )}>
                {label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}