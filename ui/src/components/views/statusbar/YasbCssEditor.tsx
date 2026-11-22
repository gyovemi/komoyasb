import React, { useState } from 'react';
import {
  Code,
  Sparkles,
  RotateCcw,
  Check,
  Palette,
  Eye,
  FileCode,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

/**
 * Component properties for the `YasbCssEditor` stylesheet editor.
 */
export interface YasbCssEditorProps {
  /** Raw CSS string content. */
  css: string;
  /** Callback fired when stylesheet content changes. */
  onChange: (updatedCss: string) => void;
  /** Optional callback to restore default YASB stylesheet template. */
  onResetDefault?: () => void;
}

/**
 * In-browser CSS editor and design token reference guide for YASB Reborn status bar styles.
 *
 * Provides syntax editing, line counts, byte sizes, and one-click copyable CSS custom properties.
 *
 * @param props - Raw CSS text and mutation callbacks.
 * @returns CSS editor component.
 */
export const YasbCssEditor: React.FC<YasbCssEditorProps> = ({
  css,
  onChange,
  onResetDefault,
}) => {
  const [activeTab, setActiveTab] = useState<'editor' | 'tokens'>('editor');
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  const tokens = [
    { name: '--bg-primary', description: 'Primary statusbar background fill' },
    { name: '--bg-secondary', description: 'Container / module background' },
    { name: '--bg-surface', description: 'Elevated popups and buttons' },
    { name: '--fg-primary', description: 'Primary text and widget icons' },
    { name: '--fg-secondary', description: 'Secondary labels / alt titles' },
    { name: '--fg-muted', description: 'Dimmed offline / empty indicators' },
    { name: '--accent', description: 'Active workspace / slider highlight' },
    { name: '--accent-secondary', description: 'Media playing accent' },
    { name: '--border-active', description: 'Focused widget stroke' },
    { name: '--border-inactive', description: 'Standard module divider stroke' },
    { name: '--error', description: 'CPU / RAM threshold alerts (>85%)' },
    { name: '--warning', description: 'Medium load warning (>60%)' },
    { name: '--success', description: 'Network connected / healthy' },
  ];

  const copyToClipboard = (tokenString: string) => {
    navigator.clipboard.writeText(`var(${tokenString})`);
    setCopiedToken(tokenString);
    setTimeout(() => setCopiedToken(null), 1500);
  };

  return (
    <div className="space-y-4">
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-xl bg-zinc-900/60 border border-zinc-800 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-pink-500/10 border border-pink-500/20 text-pink-400">
            <FileCode className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-zinc-100">YASB Custom Stylesheet (styles.css)</h3>
            <p className="text-xs text-zinc-400">
              Customize status bar geometry, typography, widget paddings, and CSS variables.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex p-0.5 bg-zinc-800/80 rounded-lg border border-zinc-700/60">
            <button
              type="button"
              onClick={() => setActiveTab('editor')}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                activeTab === 'editor'
                  ? 'bg-zinc-700 text-white shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              CSS Editor
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('tokens')}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                activeTab === 'tokens'
                  ? 'bg-zinc-700 text-white shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Tokens & Variables
            </button>
          </div>

          {onResetDefault && (
            <Button
              variant="outline"
              size="sm"
              onClick={onResetDefault}
              className="text-xs gap-1 border-zinc-700 text-zinc-300 hover:text-white cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset Default
            </Button>
          )}
        </div>
      </div>

      {/* Main Tab Content */}
      {activeTab === 'editor' ? (
        <div className="relative rounded-xl border border-zinc-800 bg-zinc-950/80 overflow-hidden shadow-2xl">
          <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800 bg-zinc-900/40 text-xs text-zinc-400 font-mono">
            <span>styles.css</span>
            <div className="flex items-center gap-3">
              <span>{css.split('\n').length} lines</span>
              <span>{(new Blob([css]).size / 1024).toFixed(1)} KB</span>
            </div>
          </div>
          <textarea
            value={css}
            onChange={(event) => onChange(event.target.value)}
            spellCheck={false}
            className="w-full h-[520px] p-4 bg-transparent font-mono text-xs text-zinc-200 resize-none focus:outline-none selection:bg-pink-500/30 leading-relaxed"
            placeholder="/* Enter custom YASB CSS rules here... */"
          />
        </div>
      ) : (
        <div className="p-6 rounded-xl border border-zinc-800 bg-zinc-900/40 space-y-4">
          <div>
            <h4 className="text-sm font-semibold text-zinc-200">Predefined CSS Custom Properties</h4>
            <p className="text-xs text-zinc-400 mt-1">
              Click any token to copy <code>var(--token)</code> to your clipboard for use in custom selectors.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 pt-2">
            {tokens.map((tokenDefinition) => (
              <div
                key={tokenDefinition.name}
                onClick={() => copyToClipboard(tokenDefinition.name)}
                className="flex flex-col justify-between p-3 rounded-lg border border-zinc-800 bg-zinc-900/60 hover:border-pink-500/40 hover:bg-zinc-800/40 transition-all cursor-pointer group"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-semibold text-pink-400 group-hover:text-pink-300">
                    {tokenDefinition.name}
                  </span>
                  {copiedToken === tokenDefinition.name ? (
                    <Badge variant="success" className="text-[10px] py-0 px-1.5 h-4">
                      Copied!
                    </Badge>
                  ) : (
                    <span className="text-[10px] text-zinc-500 group-hover:text-zinc-300">Copy</span>
                  )}
                </div>
                <p className="text-[11px] text-zinc-400 mt-1">{tokenDefinition.description}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
