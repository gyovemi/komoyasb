import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from './tabs';

describe('Tabs', () => {
  it('renders tab list and default tab content', () => {
    render(
      <Tabs defaultValue="tab1">
        <TabsList>
          <TabsTrigger value="tab1">Tab 1</TabsTrigger>
          <TabsTrigger value="tab2">Tab 2</TabsTrigger>
        </TabsList>
        <TabsContent value="tab1">Content 1</TabsContent>
        <TabsContent value="tab2">Content 2</TabsContent>
      </Tabs>
    );

    expect(screen.getByText('Content 1')).toBeInTheDocument();
    expect(screen.queryByText('Content 2')).not.toBeInTheDocument();
  });

  it('switches tabs on trigger click in uncontrolled mode', () => {
    const handleValueChange = vi.fn();
    render(
      <Tabs defaultValue="tab1" onValueChange={handleValueChange}>
        <TabsList>
          <TabsTrigger value="tab1">Tab 1</TabsTrigger>
          <TabsTrigger value="tab2">Tab 2</TabsTrigger>
        </TabsList>
        <TabsContent value="tab1">Content 1</TabsContent>
        <TabsContent value="tab2">Content 2</TabsContent>
      </Tabs>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Tab 2' }));
    expect(handleValueChange).toHaveBeenCalledWith('tab2');
    expect(screen.queryByText('Content 1')).not.toBeInTheDocument();
    expect(screen.getByText('Content 2')).toBeInTheDocument();
  });

  it('operates in controlled mode when value prop is provided', () => {
    const handleValueChange = vi.fn();
    const { rerender } = render(
      <Tabs value="tab1" onValueChange={handleValueChange}>
        <TabsList>
          <TabsTrigger value="tab1">Tab 1</TabsTrigger>
          <TabsTrigger value="tab2">Tab 2</TabsTrigger>
        </TabsList>
        <TabsContent value="tab1">Controlled 1</TabsContent>
        <TabsContent value="tab2">Controlled 2</TabsContent>
      </Tabs>
    );

    expect(screen.getByText('Controlled 1')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Tab 2' }));
    expect(handleValueChange).toHaveBeenCalledWith('tab2');

    rerender(
      <Tabs value="tab2" onValueChange={handleValueChange}>
        <TabsList>
          <TabsTrigger value="tab1">Tab 1</TabsTrigger>
          <TabsTrigger value="tab2">Tab 2</TabsTrigger>
        </TabsList>
        <TabsContent value="tab1">Controlled 1</TabsContent>
        <TabsContent value="tab2">Controlled 2</TabsContent>
      </Tabs>
    );
    expect(screen.queryByText('Controlled 1')).not.toBeInTheDocument();
    expect(screen.getByText('Controlled 2')).toBeInTheDocument();
  });

  it('handles non-element children gracefully', () => {
    render(
      <Tabs defaultValue="tab1">
        {'text node'}
        <TabsList>
          {'text node inside list'}
          <TabsTrigger value="tab1">Tab 1</TabsTrigger>
        </TabsList>
        <TabsContent value="tab1">Content</TabsContent>
      </Tabs>
    );
    expect(screen.getByText('Content')).toBeInTheDocument();
  });
});
