import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { YasbCssEditor } from './YasbCssEditor';

describe('YasbCssEditor', () => {
  const sampleCss = '.yasb-bar {\n  background: #1e1e2e;\n  color: #cdd6f4;\n}';

  it('renders editor tab with lines and size metadata', () => {
    const handleChange = vi.fn();
    render(<YasbCssEditor css={sampleCss} onChange={handleChange} />);

    expect(screen.getByText('YASB Custom Stylesheet (styles.css)')).toBeInTheDocument();
    expect(screen.getByText('4 lines')).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Enter custom YASB CSS rules here/i)).toHaveValue(sampleCss);
  });

  it('calls onChange when CSS textarea is edited', () => {
    const handleChange = vi.fn();
    render(<YasbCssEditor css={sampleCss} onChange={handleChange} />);

    const textarea = screen.getByPlaceholderText(/Enter custom YASB CSS rules here/i);
    fireEvent.change(textarea, { target: { value: '.new-rule { color: red; }' } });

    expect(handleChange).toHaveBeenCalledWith('.new-rule { color: red; }');
  });

  it('switches to Tokens tab and copies token to clipboard', () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock,
      },
    });

    render(<YasbCssEditor css={sampleCss} onChange={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Tokens & Variables' }));
    expect(screen.getByText('Predefined CSS Custom Properties')).toBeInTheDocument();

    const bgPrimaryToken = screen.getByText('--bg-primary');
    fireEvent.click(bgPrimaryToken);

    expect(writeTextMock).toHaveBeenCalledWith('var(--bg-primary)');
    expect(screen.getByText('Copied!')).toBeInTheDocument();
  });

  it('calls onResetDefault when Reset Default button is clicked', () => {
    const handleReset = vi.fn();
    render(<YasbCssEditor css={sampleCss} onChange={vi.fn()} onResetDefault={handleReset} />);

    fireEvent.click(screen.getByRole('button', { name: /Reset Default/i }));
    expect(handleReset).toHaveBeenCalled();
  });
});
