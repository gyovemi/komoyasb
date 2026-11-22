import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { WorkspaceListEditor } from './WorkspaceListEditor';
import type { MonitorDefinition } from '@/types/ipc';

const mockMonitors: MonitorDefinition[] = [
  {
    workspaces: [
      { name: '1:dev', layout: 'BSP' },
      { name: '2:web', layout: 'Columns' },
      { name: '3:chat', layout: 'Rows' },
    ],
  },
  {
    workspaces: [
      { name: '4:code', layout: 'Grid' },
      { name: '5:media', layout: 'Floating' },
    ],
  },
];

describe('WorkspaceListEditor', () => {
  it('renders display monitors and workspaces for active monitor', () => {
    const handleChange = vi.fn();
    render(<WorkspaceListEditor monitors={mockMonitors} onChange={handleChange} />);

    expect(screen.getByText('Display 1')).toBeInTheDocument();
    expect(screen.getByText('Display 2')).toBeInTheDocument();
    expect(screen.getByDisplayValue('1:dev')).toBeInTheDocument();
    expect(screen.getByDisplayValue('2:web')).toBeInTheDocument();
    expect(screen.getByDisplayValue('3:chat')).toBeInTheDocument();
  });

  it('switches active monitor on click', () => {
    const handleChange = vi.fn();
    render(<WorkspaceListEditor monitors={mockMonitors} onChange={handleChange} />);

    fireEvent.click(screen.getByText('Display 2'));
    expect(screen.getByDisplayValue('4:code')).toBeInTheDocument();
    expect(screen.getByDisplayValue('5:media')).toBeInTheDocument();
  });

  it('adds a new monitor', () => {
    const handleChange = vi.fn();
    render(<WorkspaceListEditor monitors={mockMonitors} onChange={handleChange} />);

    fireEvent.click(screen.getByRole('button', { name: /Add Monitor/i }));
    expect(handleChange).toHaveBeenCalledWith([
      ...mockMonitors,
      {
        workspaces: [{ name: 'ws-3', layout: 'BSP' }],
      },
    ]);
  });

  it('removes a monitor', () => {
    const handleChange = vi.fn();
    render(<WorkspaceListEditor monitors={mockMonitors} onChange={handleChange} />);

    const removeButtons = screen.getAllByTitle('Remove Monitor');
    fireEvent.click(removeButtons[0]);

    expect(handleChange).toHaveBeenCalledWith([mockMonitors[1]]);
  });

  it('adds a new workspace to active monitor', () => {
    const handleChange = vi.fn();
    render(<WorkspaceListEditor monitors={mockMonitors} onChange={handleChange} />);

    fireEvent.click(screen.getByRole('button', { name: /Add Workspace/i }));
    expect(handleChange).toHaveBeenCalledWith([
      {
        workspaces: [
          ...mockMonitors[0].workspaces,
          { name: '4:ws', layout: 'BSP' },
        ],
      },
      mockMonitors[1],
    ]);
  });

  it('edits workspace name and layout', () => {
    const handleChange = vi.fn();
    render(<WorkspaceListEditor monitors={mockMonitors} onChange={handleChange} />);

    const nameInput = screen.getByDisplayValue('1:dev');
    fireEvent.change(nameInput, { target: { value: '1:terminal' } });

    expect(handleChange).toHaveBeenCalledWith([
      {
        workspaces: [
          { name: '1:terminal', layout: 'BSP' },
          mockMonitors[0].workspaces[1],
          mockMonitors[0].workspaces[2],
        ],
      },
      mockMonitors[1],
    ]);

    const layoutSelects = screen.getAllByRole('combobox');
    fireEvent.change(layoutSelects[0], { target: { value: 'Columns' } });
    expect(handleChange).toHaveBeenCalled();
  });

  it('moves workspace down and up', () => {
    const handleChange = vi.fn();
    render(<WorkspaceListEditor monitors={mockMonitors} onChange={handleChange} />);

    const moveDownButtons = screen.getAllByTitle('Move Down');
    fireEvent.click(moveDownButtons[0]);

    expect(handleChange).toHaveBeenCalledWith([
      {
        workspaces: [
          mockMonitors[0].workspaces[1],
          mockMonitors[0].workspaces[0],
          mockMonitors[0].workspaces[2],
        ],
      },
      mockMonitors[1],
    ]);

    const moveUpButtons = screen.getAllByTitle('Move Up');
    fireEvent.click(moveUpButtons[1]);
    expect(handleChange).toHaveBeenCalled();
  });

  it('removes a workspace from active monitor', () => {
    const handleChange = vi.fn();
    render(<WorkspaceListEditor monitors={mockMonitors} onChange={handleChange} />);

    const deleteButtons = screen.getAllByTitle('Delete Workspace');
    fireEvent.click(deleteButtons[0]);

    expect(handleChange).toHaveBeenCalledWith([
      {
        workspaces: [
          mockMonitors[0].workspaces[1],
          mockMonitors[0].workspaces[2],
        ],
      },
      mockMonitors[1],
    ]);
  });
});
