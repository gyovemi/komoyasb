import * as React from 'react';
import type { ApplicationRule, ApplicationRuleIdentifier } from '@/types/ipc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, Search, Edit3, Check, X, ShieldAlert } from 'lucide-react';

export interface FloatRulesTableProps {
  rules: ApplicationRule[];
  onChange: (rules: ApplicationRule[]) => void;
}

const KIND_OPTIONS = [
  { value: 'Exe', label: 'Executable (Exe)' },
  { value: 'Class', label: 'Window Class' },
  { value: 'Title', label: 'Window Title' },
];

const STRATEGY_OPTIONS = [
  { value: 'Equals', label: 'Equals' },
  { value: 'StartsWith', label: 'Starts With' },
  { value: 'EndsWith', label: 'Ends With' },
  { value: 'Contains', label: 'Contains' },
  { value: 'Regex', label: 'Regular Expression' },
];

const EMPTY_RULE: ApplicationRule = {
  name: '',
  identifier: { kind: 'Exe', id: '', matching_strategy: 'Equals' },
  float: true,
};

export const FloatRulesTable: React.FC<FloatRulesTableProps> = ({ rules, onChange }) => {
  const [searchQuery, setSearchQuery] = React.useState('');
  const [filterKind, setFilterKind] = React.useState<string>('ALL');
  const [editingIndex, setEditingIndex] = React.useState<number | null>(null);
  const [editDraft, setEditDraft] = React.useState<ApplicationRule | null>(null);
  const [isAddingNew, setIsAddingNew] = React.useState(false);
  const [newRule, setNewRule] = React.useState<ApplicationRule>({ ...EMPTY_RULE });

  const filteredRules = React.useMemo(() => {
    return rules
      .map((r, originalIdx) => ({ r, originalIdx }))
      .filter(({ r }) => {
        const matchesSearch =
          searchQuery === '' ||
          r.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          r.identifier.id.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesKind = filterKind === 'ALL' || r.identifier.kind === filterKind;
        return matchesSearch && matchesKind;
      });
  }, [rules, searchQuery, filterKind]);

  const handleStartEdit = (idx: number) => {
    setEditingIndex(idx);
    setEditDraft({ ...rules[idx], identifier: { ...rules[idx].identifier } });
  };

  const handleSaveEdit = () => {
    if (editingIndex === null || !editDraft) return;
    const updated = [...rules];
    updated[editingIndex] = editDraft;
    onChange(updated);
    setEditingIndex(null);
    setEditDraft(null);
  };

  const handleDeleteRule = (idx: number) => {
    onChange(rules.filter((_, i) => i !== idx));
    if (editingIndex === idx) {
      setEditingIndex(null);
      setEditDraft(null);
    }
  };

  const handleSaveNewRule = () => {
    if (!newRule.name.trim() || !newRule.identifier.id.trim()) return;
    onChange([newRule, ...rules]);
    setNewRule({ ...EMPTY_RULE });
    setIsAddingNew(false);
  };

  return (
    <div className="space-y-6">
      {/* Search & Actions Bar */}
      <div className="rounded-xl border border-border-inactive/40 bg-background-secondary/40 p-5 backdrop-blur-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-foreground-primary">Application Float & Window Rules</h3>
            <p className="text-xs text-foreground-muted">
              Overrides configured in <code className="text-accent font-mono">applications.yaml</code> to auto-float utilities, dialogs and games.
            </p>
          </div>
          <Button size="sm" onClick={() => setIsAddingNew(true)} className="flex items-center gap-1.5 self-start sm:self-auto">
            <Plus className="h-3.5 w-3.5" /> Add Rule
          </Button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
          <div className="sm:col-span-2 relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-foreground-muted" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by app name or identifier pattern..."
              className="pl-8 text-xs h-9"
            />
          </div>
          <div>
            <Select
              value={filterKind}
              options={[
                { value: 'ALL', label: 'All Identifiers (Exe / Class / Title)' },
                { value: 'Exe', label: 'Executable only' },
                { value: 'Class', label: 'Window Class only' },
                { value: 'Title', label: 'Window Title only' },
              ]}
              onChange={setFilterKind}
              className="text-xs h-9"
            />
          </div>
        </div>
      </div>

      {/* New Rule Modal / Drawer Box */}
      {isAddingNew && (
        <div className="rounded-xl border border-accent/40 bg-background-secondary/80 p-5 space-y-4 shadow-lg backdrop-blur-md animate-in fade-in duration-200">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-accent flex items-center gap-2">
              <Plus className="h-4 w-4" /> New Application Rule
            </h4>
            <Button size="icon" variant="ghost" onClick={() => setIsAddingNew(false)} className="h-7 w-7 text-foreground-muted hover:text-foreground-primary">
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground-secondary">Friendly App Name</label>
              <Input
                value={newRule.name}
                onChange={(e) => setNewRule({ ...newRule, name: e.target.value })}
                placeholder="e.g. Spotify Desktop"
                className="text-xs h-8"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground-secondary">Identifier Pattern (Id)</label>
              <Input
                value={newRule.identifier.id}
                onChange={(e) => setNewRule({ ...newRule, identifier: { ...newRule.identifier, id: e.target.value } })}
                placeholder="e.g. Spotify.exe or #32770"
                className="text-xs h-8 font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground-secondary">Identifier Kind</label>
              <Select
                value={newRule.identifier.kind}
                options={KIND_OPTIONS}
                onChange={(v) => setNewRule({ ...newRule, identifier: { ...newRule.identifier, kind: v as ApplicationRuleIdentifier['kind'] } })}
                className="text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground-secondary">Matching Strategy</label>
              <Select
                value={newRule.identifier.matching_strategy}
                options={STRATEGY_OPTIONS}
                onChange={(v) => setNewRule({ ...newRule, identifier: { ...newRule.identifier, matching_strategy: v as ApplicationRuleIdentifier['matching_strategy'] } })}
                className="text-xs"
              />
            </div>
            <div className="flex items-center justify-between sm:justify-start sm:gap-4 p-2 rounded-lg bg-background-surface/50 border border-border-inactive/30 self-end h-9">
              <span className="text-xs font-medium text-foreground-secondary">Auto Float</span>
              <Switch checked={newRule.float ?? true} onCheckedChange={(val) => setNewRule({ ...newRule, float: val })} />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button size="sm" variant="outline" onClick={() => setIsAddingNew(false)}>Cancel</Button>
            <Button size="sm" disabled={!newRule.name.trim() || !newRule.identifier.id.trim()} onClick={handleSaveNewRule}>Add Rule</Button>
          </div>
        </div>
      )}

      {/* Rules Table */}
      <div className="rounded-xl border border-border-inactive/40 bg-background-secondary/40 overflow-hidden backdrop-blur-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-border-inactive/40 bg-background-surface/50 text-foreground-muted font-medium">
                <th className="py-3 px-4">Application Name</th>
                <th className="py-3 px-4">Kind</th>
                <th className="py-3 px-4">Identifier Pattern</th>
                <th className="py-3 px-4">Matching Strategy</th>
                <th className="py-3 px-4 text-center">Float Override</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-inactive/20">
              {filteredRules.map(({ r, originalIdx }) => {
                const isEditing = editingIndex === originalIdx && editDraft;

                if (isEditing && editDraft) {
                  return (
                    <tr key={originalIdx} className="bg-accent/10 border-accent/30">
                      <td className="py-2.5 px-3">
                        <Input
                          value={editDraft.name}
                          onChange={(e) => setEditDraft({ ...editDraft, name: e.target.value })}
                          className="h-7 text-xs"
                        />
                      </td>
                      <td className="py-2.5 px-3">
                        <Select
                          value={editDraft.identifier.kind}
                          options={KIND_OPTIONS}
                          onChange={(v) => setEditDraft({ ...editDraft, identifier: { ...editDraft.identifier, kind: v as ApplicationRuleIdentifier['kind'] } })}
                          className="h-7 text-xs"
                        />
                      </td>
                      <td className="py-2.5 px-3">
                        <Input
                          value={editDraft.identifier.id}
                          onChange={(e) => setEditDraft({ ...editDraft, identifier: { ...editDraft.identifier, id: e.target.value } })}
                          className="h-7 text-xs font-mono"
                        />
                      </td>
                      <td className="py-2.5 px-3">
                        <Select
                          value={editDraft.identifier.matching_strategy}
                          options={STRATEGY_OPTIONS}
                          onChange={(v) => setEditDraft({ ...editDraft, identifier: { ...editDraft.identifier, matching_strategy: v as ApplicationRuleIdentifier['matching_strategy'] } })}
                          className="h-7 text-xs"
                        />
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <Switch checked={editDraft.float ?? true} onCheckedChange={(val) => setEditDraft({ ...editDraft, float: val })} />
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button size="icon" variant="default" onClick={handleSaveEdit} className="h-7 w-7 text-slate-900" title="Save">
                            <Check className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="icon" variant="ghost" onClick={() => { setEditingIndex(null); setEditDraft(null); }} className="h-7 w-7 text-foreground-muted hover:text-foreground-primary" title="Cancel">
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                }

                return (
                  <tr key={originalIdx} className="hover:bg-background-surface/30 transition-colors group text-foreground-primary">
                    <td className="py-2.5 px-4 font-medium text-foreground-primary">{r.name}</td>
                    <td className="py-2.5 px-4">
                      <Badge variant="outline" className="text-[10px] uppercase font-mono">{r.identifier.kind}</Badge>
                    </td>
                    <td className="py-2.5 px-4 font-mono text-accent text-xs">{r.identifier.id}</td>
                    <td className="py-2.5 px-4 text-foreground-secondary text-xs">{r.identifier.matching_strategy}</td>
                    <td className="py-2.5 px-4 text-center">
                      <Badge variant={r.float !== false ? 'success' : 'secondary'} className="text-[10px]">
                        {r.float !== false ? 'Floating' : 'Tiled'}
                      </Badge>
                    </td>
                    <td className="py-2.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1 opacity-70 group-hover:opacity-100 transition-opacity">
                        <Button size="icon" variant="ghost" onClick={() => handleStartEdit(originalIdx)} className="h-7 w-7 text-foreground-muted hover:text-foreground-primary" title="Edit Rule">
                          <Edit3 className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => handleDeleteRule(originalIdx)} className="h-7 w-7 text-status-error/70 hover:text-status-error hover:bg-status-error/10" title="Delete Rule">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {filteredRules.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-xs text-foreground-muted">
                    <ShieldAlert className="h-6 w-6 mx-auto mb-2 text-foreground-muted/60" />
                    No application rules matching the current query.
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
