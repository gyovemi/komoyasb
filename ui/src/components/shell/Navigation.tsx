import * as React from 'react';
import { Palette, LayoutGrid, Sliders, Box, Activity, Gauge } from 'lucide-react';
import { cn } from '../../lib/utils';

/**
 * Top-level view navigation tabs supported by the desktop shell.
 */
export type NavigationTab = 'theme' | 'tiling' | 'statusbar' | 'mods' | 'performance' | 'services';

/**
 * Component properties for the shell `Navigation` sidebar.
 */
export interface NavigationProps {
  /** Currently active navigation tab key. */
  activeTab: NavigationTab;
  /** Callback fired when the user selects a different sidebar navigation item. */
  onTabChange: (selectedTab: NavigationTab) => void;
  /** Optional class name overrides. */
  className?: string;
}

/**
 * Structure of an individual sidebar navigation item entry.
 */
interface NavItem {
  /** Unique tab identifier. */
  id: NavigationTab;
  /** User-facing display title. */
  label: string;
  /** Icon component associated with the navigation tab. */
  icon: React.ComponentType<{ className?: string }>;
  /** Subtitle description outlining section scope. */
  description: string;
}

const NAV_ITEMS: NavItem[] = [
  {
    id: 'theme',
    label: 'Theme Studio',
    icon: Palette,
    description: 'Palette, typography, geometry & wallpaper',
  },
  {
    id: 'tiling',
    label: 'Tiling & Whkd',
    icon: LayoutGrid,
    description: 'Komorebi rules, layouts & keybinds',
  },
  {
    id: 'statusbar',
    label: 'Status Bar & OSD',
    icon: Sliders,
    description: 'YASB bar widgets, CSS & FluentFlyout',
  },
  {
    id: 'mods',
    label: 'Mods & Launcher',
    icon: Box,
    description: 'Flow Launcher & Windhawk hooks',
  },
  {
    id: 'performance',
    label: 'Performance',
    icon: Gauge,
    description: 'Profiles, animations & polling rates',
  },
  {
    id: 'services',
    label: 'Services & Sync',
    icon: Activity,
    description: 'Process supervisor, backups & dry-run',
  },
];

/**
 * Sidebar navigation component providing persistent switching between application modules.
 *
 * Implements accessible button selection, indicator badges, and tool descriptions.
 *
 * @param props - Current tab state and navigation change handler.
 * @returns Sidebar navigation panel.
 */
export const Navigation: React.FC<NavigationProps> = ({ activeTab, onTabChange, className }) => {
  return (
    <nav className={cn('w-60 bg-background-primary border-r border-border-inactive/40 flex flex-col py-3 px-2 select-none shrink-0', className)}>
      <div className="px-3 pb-2 text-[11px] font-semibold tracking-wider text-foreground-muted uppercase">
        Navigation
      </div>
      <div className="flex flex-col gap-1">
        {NAV_ITEMS.map((navigationItem) => {
          const ItemIcon = navigationItem.icon;
          const isTabActive = activeTab === navigationItem.id;
          return (
            <button
              key={navigationItem.id}
              type="button"
              onClick={() => onTabChange(navigationItem.id)}
              className={cn(
                'group flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all cursor-pointer border',
                isTabActive
                  ? 'bg-background-secondary border-border-active text-foreground-primary shadow-sm'
                  : 'bg-transparent border-transparent hover:bg-background-surface/60 text-foreground-secondary hover:text-foreground-primary'
              )}
            >
              <div
                className={cn(
                  'p-1.5 rounded-md transition-colors',
                  isTabActive
                    ? 'bg-accent/20 text-accent'
                    : 'bg-background-surface text-foreground-muted group-hover:text-foreground-secondary'
                )}
              >
                <ItemIcon className="w-4 h-4" />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-sm font-medium leading-none truncate">{navigationItem.label}</span>
                <span className="text-[10px] text-foreground-muted truncate mt-0.5 leading-tight">
                  {navigationItem.description}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
