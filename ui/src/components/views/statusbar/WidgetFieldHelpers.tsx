import React from 'react';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Select } from '@/components/ui/select';

export interface FieldDef {
  key: string;
  label: string;
  type: 'text' | 'switch' | 'slider' | 'select';
  placeholder?: string;
  hint?: string;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  options?: { value: string; label: string }[];
}

export interface CompactFieldProps {
  field: FieldDef;
  value: unknown;
  onChange: (value: unknown) => void;
}

export const CompactField: React.FC<CompactFieldProps> = ({ field, value, onChange }) => {
  if (field.type === 'switch') {
    return (
      <div className="flex items-center justify-between p-3 rounded-lg bg-zinc-900/40 border border-zinc-800">
        <span className="text-xs text-zinc-300">{field.label}</span>
        <Switch checked={Boolean(value)} onCheckedChange={onChange} />
      </div>
    );
  }

  if (field.type === 'slider') {
    const numVal = (value as number) ?? field.min ?? 0;
    return (
      <div>
        <label className="text-xs font-medium text-zinc-300 block mb-1.5">
          {field.label}: {numVal}
          {field.unit || ''}
        </label>
        <Slider
          min={field.min ?? 0}
          max={field.max ?? 100}
          step={field.step ?? 1}
          value={numVal}
          onChange={onChange}
        />
      </div>
    );
  }

  if (field.type === 'select') {
    return (
      <div>
        <label className="text-xs font-medium text-zinc-300 block mb-1.5">{field.label}</label>
        <Select
          value={(value as string) || ''}
          onChange={onChange}
          options={field.options || []}
        />
      </div>
    );
  }

  return (
    <div>
      <label className="text-xs font-medium text-zinc-300 block mb-1.5">{field.label}</label>
      <Input
        value={(value as string) || ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder={field.placeholder}
      />
      {field.hint && <span className="text-[10px] text-zinc-500 mt-1 block">{field.hint}</span>}
    </div>
  );
};
