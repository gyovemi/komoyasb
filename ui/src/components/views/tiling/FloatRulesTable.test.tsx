import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FloatRulesTable } from './FloatRulesTable';
import type { ApplicationRule } from '@/types/ipc';

const mockRules: ApplicationRule[] = [
  {
    name: 'Spotify',
    identifier: { kind: 'Exe', id: 'Spotify.exe', matching_strategy: 'Equals' },
    float: true,
  },
  {
    name: 'Calculator',
    identifier: { kind: 'Class', id: 'CalcFrame', matching_strategy: 'Contains' },
    float: true,
  },
  {
    name: 'Notepad',
    identifier: { kind: 'Title', id: 'Untitled - Notepad', matching_strategy: 'StartsWith' },
    float: false,
  },
];

describe('FloatRulesTable', () => {
  it('renders application rules in table', () => {
    const handleChange = vi.fn();
    render(<FloatRulesTable rules={mockRules} onChange={handleChange} />);

    expect(screen.getByText('Spotify')).toBeInTheDocument();
    expect(screen.getByText('Spotify.exe')).toBeInTheDocument();
    expect(screen.getByText('Calculator')).toBeInTheDocument();
    expect(screen.getByText('Notepad')).toBeInTheDocument();
    expect(screen.getByText('Tiled')).toBeInTheDocument();
  });

  it('filters rules by search query', () => {
    const handleChange = vi.fn();
    render(<FloatRulesTable rules={mockRules} onChange={handleChange} />);

    const searchInput = screen.getByPlaceholderText(/Search by app name or identifier pattern/i);
    fireEvent.change(searchInput, { target: { value: 'Spotify' } });

    expect(screen.getByText('Spotify')).toBeInTheDocument();
    expect(screen.queryByText('Calculator')).not.toBeInTheDocument();
  });

  it('filters rules by kind selector', () => {
    const handleChange = vi.fn();
    render(<FloatRulesTable rules={mockRules} onChange={handleChange} />);

    const comboboxes = screen.getAllByRole('combobox');
    // First combobox is filterKind
    fireEvent.change(comboboxes[0], { target: { value: 'Class' } });

    expect(screen.getByText('Calculator')).toBeInTheDocument();
    expect(screen.queryByText('Spotify')).not.toBeInTheDocument();
  });

  it('displays empty state when search matches nothing', () => {
    const handleChange = vi.fn();
    render(<FloatRulesTable rules={mockRules} onChange={handleChange} />);

    const searchInput = screen.getByPlaceholderText(/Search by app name/i);
    fireEvent.change(searchInput, { target: { value: 'NonexistentAppXYZ' } });

    expect(screen.getByText(/No application rules matching the current query/i)).toBeInTheDocument();
  });

  it('adds a new rule', () => {
    const handleChange = vi.fn();
    render(<FloatRulesTable rules={mockRules} onChange={handleChange} />);

    fireEvent.click(screen.getByRole('button', { name: /Add Rule/i }));
    expect(screen.getByText('New Application Rule')).toBeInTheDocument();

    const nameInput = screen.getByPlaceholderText(/e\.g\. Spotify Desktop/i);
    const idInput = screen.getByPlaceholderText(/e\.g\. Spotify\.exe or #32770/i);

    fireEvent.change(nameInput, { target: { value: 'Slack' } });
    fireEvent.change(idInput, { target: { value: 'slack.exe' } });

    // Click Add Rule submit button
    const addRuleButtons = screen.getAllByRole('button', { name: 'Add Rule' });
    fireEvent.click(addRuleButtons[addRuleButtons.length - 1]);

    expect(handleChange).toHaveBeenCalledWith([
      expect.objectContaining({
        name: 'Slack',
        identifier: expect.objectContaining({ id: 'slack.exe' }),
      }),
      ...mockRules,
    ]);
  });

  it('allows changing dropdowns and cancelling new rule addition', () => {
    const handleChange = vi.fn();
    render(<FloatRulesTable rules={mockRules} onChange={handleChange} />);

    fireEvent.click(screen.getByRole('button', { name: /Add Rule/i }));

    const comboboxes = screen.getAllByRole('combobox');
    // kind select (combobox 1)
    fireEvent.change(comboboxes[1], { target: { value: 'Title' } });
    // matching strategy select (combobox 2)
    fireEvent.change(comboboxes[2], { target: { value: 'Regex' } });

    // Toggle Auto Float switch
    const autoFloatSwitch = screen.getAllByRole('switch')[0];
    fireEvent.click(autoFloatSwitch);

    // Cancel
    const cancelBtn = screen.getByRole('button', { name: 'Cancel' });
    fireEvent.click(cancelBtn);

    expect(screen.queryByText('New Application Rule')).not.toBeInTheDocument();
  });

  it('edits an existing rule and saves changes', () => {
    const handleChange = vi.fn();
    render(<FloatRulesTable rules={mockRules} onChange={handleChange} />);

    const editButtons = screen.getAllByTitle('Edit Rule');
    fireEvent.click(editButtons[0]);

    // Name input is now editable in the first row
    const inputs = screen.getAllByDisplayValue('Spotify');
    fireEvent.change(inputs[0], { target: { value: 'Spotify Premium' } });

    // Edit dropdowns in table row
    const comboboxes = screen.getAllByRole('combobox');
    // kind combobox in table
    const tableKindCombobox = comboboxes.find((c) => (c as HTMLSelectElement).value === 'Exe');
    if (tableKindCombobox) {
      fireEvent.change(tableKindCombobox, { target: { value: 'Title' } });
    }
    const tableStrategyCombobox = comboboxes.find((c) => (c as HTMLSelectElement).value === 'Equals');
    if (tableStrategyCombobox) {
      fireEvent.change(tableStrategyCombobox, { target: { value: 'Regex' } });
    }

    // Toggle float override switch in table
    const tableSwitches = screen.getAllByRole('switch');
    if (tableSwitches.length > 0) {
      fireEvent.click(tableSwitches[tableSwitches.length - 1]);
    }

    fireEvent.click(screen.getByTitle('Save'));
    expect(handleChange).toHaveBeenCalledWith([
      expect.objectContaining({ name: 'Spotify Premium' }),
      mockRules[1],
      mockRules[2],
    ]);
  });

  it('cancels editing an existing rule', () => {
    const handleChange = vi.fn();
    render(<FloatRulesTable rules={mockRules} onChange={handleChange} />);

    const editButtons = screen.getAllByTitle('Edit Rule');
    fireEvent.click(editButtons[0]);

    fireEvent.click(screen.getByTitle('Cancel'));
    expect(handleChange).not.toHaveBeenCalled();
  });

  it('deletes a rule', () => {
    const handleChange = vi.fn();
    render(<FloatRulesTable rules={mockRules} onChange={handleChange} />);

    const deleteButtons = screen.getAllByTitle('Delete Rule');
    fireEvent.click(deleteButtons[0]);

    expect(handleChange).toHaveBeenCalledWith([mockRules[1], mockRules[2]]);
  });
});
