import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Navigation, NavigationTab } from './Navigation';

describe('Navigation', () => {
  const allTabs: NavigationTab[] = ['theme', 'tiling', 'statusbar', 'mods', 'performance', 'services'];
  const tabLabels = [
    'Theme Studio',
    'Tiling & Whkd',
    'Status Bar & OSD',
    'Mods & Launcher',
    'Performance',
    'Services & Sync',
  ];

  it('renders all navigation items', () => {
    const handleTabChange = vi.fn();
    render(<Navigation activeTab="theme" onTabChange={handleTabChange} />);

    tabLabels.forEach((label) => {
      expect(screen.getByText(label)).toBeInTheDocument();
    });
  });

  it('calls onTabChange when navigation tab is clicked', () => {
    const handleTabChange = vi.fn();
    render(<Navigation activeTab="theme" onTabChange={handleTabChange} />);

    fireEvent.click(screen.getByText('Tiling & Whkd'));
    expect(handleTabChange).toHaveBeenCalledWith('tiling');

    fireEvent.click(screen.getByText('Performance'));
    expect(handleTabChange).toHaveBeenCalledWith('performance');
  });

  it('highlights the active tab', () => {
    const handleTabChange = vi.fn();
    const { container } = render(<Navigation activeTab="statusbar" onTabChange={handleTabChange} />);

    const buttons = container.querySelectorAll('button');
    // StatusBar is the 3rd item (index 2)
    expect(buttons[2]).toHaveClass('bg-background-secondary');
  });

  it('applies custom className', () => {
    const handleTabChange = vi.fn();
    const { container } = render(<Navigation activeTab="theme" onTabChange={handleTabChange} className="custom-nav" />);
    expect(container.firstChild).toHaveClass('custom-nav');
  });
});
