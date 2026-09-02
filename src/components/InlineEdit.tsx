'use client';

import {useRef, useState} from 'react';
import {NumberInput} from '@astryxdesign/core/NumberInput';
import {TextInput} from '@astryxdesign/core/TextInput';
import {Text} from '@astryxdesign/core/Text';

import {formatEuro} from './common';

/**
 * Click a cell, type, Tab or Enter to commit, Escape to abandon.
 *
 * The control is only mounted while the cell is being edited. With 200 rows on
 * screen that is the difference between a table that scrolls and one that
 * stutters — and a grid of permanently-live inputs is also a grid of things you
 * can change by scrolling past with a trackpad.
 */

interface InlineNumberProps {
  value: number | null;
  onCommit: (value: number | null) => void | Promise<void>;
  label: string;
  format?: (value: number | null) => string;
  isDisabled?: boolean;
}

export function InlineNumber({
  value,
  onCommit,
  label,
  format = formatEuro,
  isDisabled,
}: InlineNumberProps) {
  // The draft is seeded when editing starts rather than synced from the prop by
  // an effect: the resting state has no draft to keep in step, and an effect
  // here would fight the optimistic update the commit triggers.
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState<number | null>(value);

  if (!isEditing) {
    return (
      <EditableCell
        label={`${label}: ${format(value)}. Click to edit.`}
        isDisabled={isDisabled}
        onActivate={() => {
          setDraft(value);
          setIsEditing(true);
        }}
      >
        <Text hasTabularNumbers color={value == null ? 'secondary' : 'primary'}>
          {format(value)}
        </Text>
      </EditableCell>
    );
  }

  const commit = (next: number | null) => {
    setIsEditing(false);
    if (next !== value) void onCommit(next);
  };

  return (
    <NumberInput
      label={label}
      isLabelHidden
      size="sm"
      hasAutoFocus
      min={0}
      value={draft}
      onChange={(next) => setDraft(Number.isFinite(next) ? next : null)}
      onBlur={() => commit(draft)}
      onEnter={() => commit(draft)}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          setDraft(value);
          setIsEditing(false);
        }
      }}
    />
  );
}

interface InlineTextProps {
  value: string | null;
  onCommit: (value: string | null) => void | Promise<void>;
  label: string;
  placeholder?: string;
  isDisabled?: boolean;
}

export function InlineText({
  value,
  onCommit,
  label,
  placeholder,
  isDisabled,
}: InlineTextProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? '');

  if (!isEditing) {
    return (
      <EditableCell
        label={`${label}: ${value || 'empty'}. Click to edit.`}
        isDisabled={isDisabled}
        onActivate={() => {
          setDraft(value ?? '');
          setIsEditing(true);
        }}
      >
        <Text color={value ? 'primary' : 'secondary'} maxLines={1}>
          {value || placeholder || '—'}
        </Text>
      </EditableCell>
    );
  }

  const commit = () => {
    setIsEditing(false);
    const next = draft.trim() ? draft.trim() : null;
    if (next !== value) void onCommit(next);
  };

  return (
    <TextInput
      label={label}
      isLabelHidden
      size="sm"
      hasAutoFocus
      placeholder={placeholder}
      value={draft}
      onChange={setDraft}
      onBlur={commit}
      onEnter={commit}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          setDraft(value ?? '');
          setIsEditing(false);
        }
      }}
    />
  );
}

/**
 * The resting state of an editable cell: a real button, so it is reachable by
 * keyboard and announced as activatable, styled down to look like the text it
 * replaces.
 */
function EditableCell({
  children,
  label,
  onActivate,
  isDisabled,
}: {
  children: React.ReactNode;
  label: string;
  onActivate: () => void;
  isDisabled?: boolean;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      disabled={isDisabled}
      onClick={onActivate}
      className="w-full cursor-text rounded-sm border border-transparent bg-transparent px-1 py-0.5 text-left hover:border-border hover:bg-surface disabled:cursor-default disabled:hover:border-transparent disabled:hover:bg-transparent"
    >
      {children}
    </button>
  );
}
