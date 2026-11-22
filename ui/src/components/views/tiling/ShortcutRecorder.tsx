import * as React from 'react';
import type { HotkeyBinding, HotkeyConflict } from '@/types/ipc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { tilingApi } from '@/lib/ipc';
import {
  Keyboard,
  Plus,
  Trash2,
  AlertTriangle,
  Search,
  Edit2,
  Check,
  X,
} from 'lucide-react';

export interface ShortcutRecorderProps {
  hotkeys: HotkeyBinding[];
  onChange: (hotkeys: HotkeyBinding[]) => void;
}

type Modifier = 'alt' | 'ctrl' | 'shift' | 'win';
const ALL_MODIFIERS: Modifier[] = ['win', 'alt', 'ctrl', 'shift'];

const CATEGORY_OPTIONS: { value: HotkeyBinding['category']; label: string }[] = [
  { value: 'navigation', label: 'Window Navigation' },
  { value: 'move', label: 'Window Movement / Swap' },
  { value: 'resize', label: 'Resize Containers' },
  { value: 'workspace', label: 'Workspace Switch / Move' },
  { value: 'monitor', label: 'Multi-Monitor' },
  { value: 'layout', label: 'Layout Algorithm' },
  { value: 'launcher', label: 'Launcher / Shell' },
  { value: 'system', label: 'System Controls' },
  { value: 'custom', label: 'Custom Command' },
];

const PRESET_COMMANDS = [
  { label: 'Focus Left', cmd: 'komorebic focus left', cat: 'navigation' },
  { label: 'Focus Down', cmd: 'komorebic focus down', cat: 'navigation' },
  { label: 'Focus Up', cmd: 'komorebic focus up', cat: 'navigation' },
  { label: 'Focus Right', cmd: 'komorebic focus right', cat: 'navigation' },
  { label: 'Move Left', cmd: 'komorebic move left', cat: 'move' },
  { label: 'Move Down', cmd: 'komorebic move down', cat: 'move' },
  { label: 'Move Up', cmd: 'komorebic move up', cat: 'move' },
  { label: 'Move Right', cmd: 'komorebic move right', cat: 'move' },
  { label: 'Toggle Float', cmd: 'komorebic toggle-float', cat: 'layout' },
  { label: 'Toggle Monocle', cmd: 'komorebic toggle-monocle', cat: 'layout' },
  { label: 'Cycle Workspace Next', cmd: 'komorebic cycle-workspace next', cat: 'workspace' },
  { label: 'Cycle Workspace Prev', cmd: 'komorebic cycle-workspace previous', cat: 'workspace' },
  { label: 'Cycle Monitor Next', cmd: 'komorebic cycle-monitor next', cat: 'monitor' },
  { label: 'Reload Configuration', cmd: 'komorebic reload-configuration', cat: 'system' },
];

const SYSTEM_RESERVED_COMBOS = new Set([
  'win+l', 'win+d', 'win+e', 'win+r', 'win+x', 'win+i', 'win+tab',
  'ctrl+alt+delete', 'ctrl+shift+escape', 'alt+f4', 'alt+tab',
]);

const normalizeCombo = (modifiers: string[], key: string) =>
  [...modifiers].sort().join('+') + '+' + key.toLowerCase();

export const ShortcutRecorder: React.FC<ShortcutRecorderProps> = ({ hotkeys, onChange }) => {
  const [searchQuery, setSearchQuery] = React.useState('');
  const [filterCategory, setFilterCategory] = React.useState<string>('ALL');
  const [conflicts, setConflicts] = React.useState<HotkeyConflict[]>([]);

  const [recordingId, setRecordingId] = React.useState<string | null>(null);
  const [editingIndex, setEditingIndex] = React.useState<number | null>(null);
  const [editDraft, setEditDraft] = React.useState<HotkeyBinding | null>(null);

  const [isAddingNew, setIsAddingNew] = React.useState(false);
  const [newModifiers, setNewModifiers] = React.useState<Modifier[]>(['alt']);
  const [newKey, setNewKey] = React.useState<string>('');
  const [newCommand, setNewCommand] = React.useState<string>('');
  const [newCategory, setNewCategory] = React.useState<HotkeyBinding['category']>('navigation');
  const [newComment, setNewComment] = React.useState<string>('');
  const [isCapturingKeyNew, setIsCapturingKeyNew] = React.useState(false);

  React.useEffect(() => {
    const map = new Map<string, HotkeyBinding>();
    const clientConflicts: HotkeyConflict[] = [];

    for (const hk of hotkeys) {
      const combo = normalizeCombo(hk.modifiers, hk.key);
      if (SYSTEM_RESERVED_COMBOS.has(combo)) {
        clientConflicts.push({ keyCombination: combo, bindingA: hk, bindingB: hk, reason: 'SYSTEM_RESERVED' });
      } else if (map.has(combo)) {
        clientConflicts.push({ keyCombination: combo, bindingA: map.get(combo)!, bindingB: hk, reason: 'DUPLICATE_BINDING' });
      } else {
        map.set(combo, hk);
      }
    }

    setConflicts(clientConflicts);

    tilingApi.validateHotkeys(hotkeys)
      .then((backendConflicts) => {
        if (backendConflicts?.length) setConflicts(backendConflicts);
      })
      .catch(() => {});
  }, [hotkeys]);

  const handleKeyCapture = (e: React.KeyboardEvent, isNew: boolean) => {
    e.preventDefault();
    e.stopPropagation();
    if (['Control', 'Alt', 'Shift', 'Meta', 'CapsLock', 'Tab'].includes(e.key)) return;

    let keyName = e.key.toLowerCase();
    if (keyName === ' ') keyName = 'space';
    if (e.code.startsWith('Digit')) keyName = e.code.replace('Digit', '');
    if (e.code.startsWith('Key')) keyName = e.code.replace('Key', '').toLowerCase();

    if (isNew) {
      setNewKey(keyName);
      setIsCapturingKeyNew(false);
    } else if (editDraft) {
      setEditDraft({ ...editDraft, key: keyName });
      setRecordingId(null);
    }
  };

  const toggleMod = (mod: Modifier, current: Modifier[]): Modifier[] =>
    current.includes(mod) ? current.filter((m) => m !== mod) : [...current, mod];

  const handleSaveNew = () => {
    if (!newKey.trim() || !newCommand.trim()) return;
    const created: HotkeyBinding = {
      id: `whkd-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      modifiers: newModifiers,
      key: newKey.toLowerCase().trim(),
      command: newCommand.trim(),
      category: newCategory,
      rawComment: newComment.trim() || undefined,
    };
    onChange([created, ...hotkeys]);
    setNewKey('');
    setNewCommand('');
    setNewComment('');
    setIsAddingNew(false);
  };

  const handleSaveEdit = () => {
    if (editingIndex === null || !editDraft) return;
    const updated = [...hotkeys];
    updated[editingIndex] = editDraft;
    onChange(updated);
    setEditingIndex(null);
    setEditDraft(null);
    setRecordingId(null);
  };

  const filteredHotkeys = React.useMemo(() => {
    return hotkeys
      .map((hk, originalIdx) => ({ hk, originalIdx }))
      .filter(({ hk }) => {
        const combo = `${hk.modifiers.join('+')}+${hk.key}`.toLowerCase();
        const matchesSearch =
          searchQuery === '' ||
          combo.includes(searchQuery.toLowerCase()) ||
          hk.command.toLowerCase().includes(searchQuery.toLowerCase()) ||
          Boolean(hk.rawComment?.toLowerCase().includes(searchQuery.toLowerCase()));
        const matchesCat = filterCategory === 'ALL' || hk.category === filterCategory;
        return matchesSearch && matchesCat;
      });
  }, [hotkeys, searchQuery, filterCategory]);

  return (
    <div className="space-y-6">
      {/* Conflicts Banner */}
      {conflicts.length > 0 && (
        <div className="rounded-xl border border-status-error/40 bg-status-error/10 p-4 space-y-2 text-xs">
          <div className="flex items-center gap-2 font-semibold text-status-error">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>Shortcut Conflicts Detected ({conflicts.length})</span>
          </div>
          <p className="text-foreground-secondary text-[11px]">
            The following combinations are duplicated or collide with Windows system reserved hotkeys:
          </p>
          <div className="space-y-1.5 pt-1">
            {conflicts.map((c, i) => (
              <div key={i} className="flex items-center justify-between p-2 rounded bg-background-surface/80 border border-status-error/20">
                <div className="flex items-center gap-2">
                  <Badge variant="destructive" className="font-mono text-[10px]">{c.keyCombination.toUpperCase()}</Badge>
                  <span className="text-foreground-secondary">
                    {c.reason === 'SYSTEM_RESERVED'
                      ? 'System Reserved Keybind (Windows)'
                      : `Duplicate in commands: "${c.bindingA?.command}" & "${c.bindingB?.command}"`}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Header & Filter Controls */}
      <div className="rounded-xl border border-border-inactive/40 bg-background-secondary/40 p-5 backdrop-blur-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-foreground-primary">Interactive whkd Keybind Manager</h3>
            <p className="text-xs text-foreground-muted">
              Configure keyboard navigation, workspace switching, and komorebi shortcuts synchronized with <code className="text-accent font-mono">whkdrc</code>.
            </p>
          </div>
          <Button size="sm" onClick={() => setIsAddingNew(true)} className="flex items-center gap-1.5 self-start sm:self-auto">
            <Plus className="h-3.5 w-3.5" /> New Shortcut
          </Button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
          <div className="sm:col-span-2 relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-foreground-muted" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by combination (e.g. alt+h) or command..."
              className="pl-8 text-xs h-9"
            />
          </div>
          <div>
            <Select
              value={filterCategory}
              options={[{ value: 'ALL', label: 'All Categories' }, ...CATEGORY_OPTIONS]}
              onChange={setFilterCategory}
              className="text-xs h-9"
            />
          </div>
        </div>
      </div>

      {/* Add New Shortcut Drawer */}
      {isAddingNew && (
        <div className="rounded-xl border border-accent/40 bg-background-secondary/80 p-5 space-y-4 shadow-lg backdrop-blur-md animate-in fade-in duration-200">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-accent flex items-center gap-2">
              <Plus className="h-4 w-4" /> Record New Hotkey Binding
            </h4>
            <Button size="icon" variant="ghost" onClick={() => setIsAddingNew(false)} className="h-7 w-7 text-foreground-muted hover:text-foreground-primary">
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-foreground-secondary">Key Combination</label>
            <div className="flex flex-wrap items-center gap-2">
              {ALL_MODIFIERS.map((mod) => {
                const active = newModifiers.includes(mod);
                return (
                  <button
                    key={mod}
                    type="button"
                    onClick={() => setNewModifiers(toggleMod(mod, newModifiers))}
                    className={`px-3 py-1.5 rounded-md text-xs font-mono font-medium border transition-colors ${
                      active ? 'border-accent bg-accent text-slate-900 font-bold' : 'border-border-inactive/60 bg-background-surface text-foreground-secondary hover:bg-background-secondary'
                    }`}
                  >
                    {mod.toUpperCase()}
                  </button>
                );
              })}
              <span className="text-foreground-muted text-xs font-bold">+</span>
              <button
                type="button"
                onClick={() => setIsCapturingKeyNew(true)}
                onKeyDown={(e) => handleKeyCapture(e, true)}
                className={`min-w-[90px] h-8 px-3 rounded-md text-xs font-mono border flex items-center justify-center transition-all ${
                  isCapturingKeyNew
                    ? 'border-accent bg-accent/20 text-accent ring-2 ring-accent animate-pulse'
                    : newKey
                    ? 'border-border-inactive bg-background-surface text-foreground-primary font-bold'
                    : 'border-dashed border-border-inactive bg-background-surface/40 text-foreground-muted'
                }`}
              >
                {isCapturingKeyNew ? 'Press any key...' : newKey ? newKey.toUpperCase() : 'Capture Key'}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground-secondary">Category</label>
              <Select value={newCategory} options={CATEGORY_OPTIONS} onChange={(v) => setNewCategory(v as HotkeyBinding['category'])} className="text-xs" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground-secondary">Preset Command Template</label>
              <Select
                value=""
                options={[{ value: '', label: '-- Choose a preset action or type below --' }, ...PRESET_COMMANDS.map((p) => ({ value: p.cmd, label: `${p.label} (${p.cmd})` }))]}
                onChange={(cmd) => {
                  if (cmd) {
                    setNewCommand(cmd);
                    const matched = PRESET_COMMANDS.find((p) => p.cmd === cmd);
                    if (matched) setNewCategory(matched.cat as HotkeyBinding['category']);
                  }
                }}
                className="text-xs"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground-secondary">Command to Execute</label>
            <Input value={newCommand} onChange={(e) => setNewCommand(e.target.value)} placeholder="e.g. komorebic focus left" className="text-xs font-mono h-8" />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground-secondary">Comment / Description</label>
            <Input value={newComment} onChange={(e) => setNewComment(e.target.value)} placeholder="Optional description" className="text-xs h-8" />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button size="sm" variant="outline" onClick={() => setIsAddingNew(false)}>Cancel</Button>
            <Button size="sm" disabled={!newKey.trim() || !newCommand.trim()} onClick={handleSaveNew}>Add Shortcut</Button>
          </div>
        </div>
      )}

      {/* Hotkeys Table */}
      <div className="rounded-xl border border-border-inactive/40 bg-background-secondary/40 overflow-hidden backdrop-blur-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-border-inactive/40 bg-background-surface/50 text-foreground-muted font-medium">
                <th className="py-3 px-4">Hotkey Combination</th>
                <th className="py-3 px-4">Category</th>
                <th className="py-3 px-4">Command</th>
                <th className="py-3 px-4">Comment</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-inactive/20">
              {filteredHotkeys.map(({ hk, originalIdx }) => {
                const isEditing = editingIndex === originalIdx && editDraft;
                const comboStr = normalizeCombo(hk.modifiers, hk.key);
                const hasConflict = conflicts.some((c) => c.keyCombination.toLowerCase() === comboStr);

                if (isEditing && editDraft) {
                  return (
                    <tr key={hk.id || originalIdx} className="bg-accent/10 border-accent/30">
                      <td className="py-2.5 px-3">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {ALL_MODIFIERS.map((mod) => {
                            const active = editDraft.modifiers.includes(mod);
                            return (
                              <button
                                key={mod}
                                type="button"
                                onClick={() => setEditDraft({ ...editDraft, modifiers: toggleMod(mod, editDraft.modifiers) })}
                                className={`px-2 py-0.5 rounded text-[10px] font-mono border transition-colors ${
                                  active ? 'border-accent bg-accent text-slate-900 font-bold' : 'border-border-inactive bg-background-surface text-foreground-muted'
                                }`}
                              >
                                {mod.toUpperCase()}
                              </button>
                            );
                          })}
                          <span className="text-foreground-muted text-[10px]">+</span>
                          <button
                            type="button"
                            onClick={() => setRecordingId(hk.id)}
                            onKeyDown={(e) => handleKeyCapture(e, false)}
                            className={`px-2 py-0.5 rounded text-[10px] font-mono border ${
                              recordingId === hk.id
                                ? 'border-accent bg-accent/20 text-accent ring-1 ring-accent animate-pulse'
                                : 'border-border-inactive bg-background-surface text-foreground-primary'
                            }`}
                          >
                            {recordingId === hk.id ? 'Press...' : editDraft.key.toUpperCase()}
                          </button>
                        </div>
                      </td>
                      <td className="py-2.5 px-3">
                        <Select value={editDraft.category} options={CATEGORY_OPTIONS} onChange={(v) => setEditDraft({ ...editDraft, category: v as HotkeyBinding['category'] })} className="h-7 text-xs" />
                      </td>
                      <td className="py-2.5 px-3">
                        <Input value={editDraft.command} onChange={(e) => setEditDraft({ ...editDraft, command: e.target.value })} className="h-7 text-xs font-mono" />
                      </td>
                      <td className="py-2.5 px-3">
                        <Input value={editDraft.rawComment || ''} onChange={(e) => setEditDraft({ ...editDraft, rawComment: e.target.value })} className="h-7 text-xs" />
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button size="icon" variant="default" onClick={handleSaveEdit} className="h-7 w-7 text-slate-900" title="Save">
                            <Check className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="icon" variant="ghost" onClick={() => { setEditingIndex(null); setEditDraft(null); setRecordingId(null); }} className="h-7 w-7 text-foreground-muted hover:text-foreground-primary" title="Cancel">
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                }

                return (
                  <tr key={hk.id || originalIdx} className="hover:bg-background-surface/30 transition-colors group text-foreground-primary">
                    <td className="py-2.5 px-4 font-mono font-medium">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {hk.modifiers.map((m) => (
                          <span key={m} className="px-1.5 py-0.5 rounded bg-background-surface border border-border-inactive/50 text-[11px] text-foreground-secondary uppercase">
                            {m}
                          </span>
                        ))}
                        <span className="text-foreground-muted text-xs">+</span>
                        <span className="px-2 py-0.5 rounded bg-accent/15 border border-accent/40 text-[11px] text-accent font-bold uppercase">
                          {hk.key}
                        </span>
                        {hasConflict && (
                          <span title="Conflict detected on this combination!">
                            <AlertTriangle className="h-3.5 w-3.5 text-status-error ml-1 shrink-0" />
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-2.5 px-4">
                      <Badge variant="outline" className="text-[10px] capitalize">{hk.category}</Badge>
                    </td>
                    <td className="py-2.5 px-4 font-mono text-accent text-xs">{hk.command}</td>
                    <td className="py-2.5 px-4 text-foreground-muted text-xs truncate max-w-[160px]">{hk.rawComment || '—'}</td>
                    <td className="py-2.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1 opacity-70 group-hover:opacity-100 transition-opacity">
                        <Button size="icon" variant="ghost" onClick={() => { setEditingIndex(originalIdx); setEditDraft({ ...hk, modifiers: [...hk.modifiers] }); }} className="h-7 w-7 text-foreground-muted hover:text-foreground-primary" title="Edit Shortcut">
                          <Edit2 className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => onChange(hotkeys.filter((h) => h.id !== hk.id))} className="h-7 w-7 text-status-error/70 hover:text-status-error hover:bg-status-error/10" title="Delete Shortcut">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {filteredHotkeys.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-xs text-foreground-muted">
                    <Keyboard className="h-6 w-6 mx-auto mb-2 text-foreground-muted/60" />
                    No hotkeys matching the search filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
export default ShortcutRecorder;
