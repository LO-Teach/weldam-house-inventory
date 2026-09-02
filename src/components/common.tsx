'use client';

import {Badge} from '@astryxdesign/core/Badge';
import {Text} from '@astryxdesign/core/Text';
import {Tooltip} from '@astryxdesign/core/Tooltip';

import {
  CHANNEL_LABELS,
  CHANNELS,
  CONFIDENCE_HUE,
  CONFIDENCE_LABELS,
  CONFIDENCES,
  STATUS_HUE,
  STATUS_LABELS,
  STATUSES,
  type Channel,
  type Confidence,
  type Status,
} from '@/src/lib/types';

/** Selector option lists, built once from the enums so they cannot drift. */
export const CHANNEL_OPTIONS = CHANNELS.map((value) => ({
  value,
  label: CHANNEL_LABELS[value],
}));

export const STATUS_OPTIONS = STATUSES.map((value) => ({
  value,
  label: STATUS_LABELS[value],
}));

export const CONFIDENCE_OPTIONS = CONFIDENCES.map((value) => ({
  value,
  label: CONFIDENCE_LABELS[value],
}));

export function StatusBadge({status}: {status: Status | null | undefined}) {
  if (!status) return <Text color="secondary">—</Text>;
  return <Badge variant={STATUS_HUE[status]} label={STATUS_LABELS[status]} />;
}

/**
 * Confidence is about the identification, not the price. `guessing` is not a
 * failure state — most unmarked objects genuinely are — so it reads as a warm
 * amber rather than an error red.
 */
export function ConfidenceBadge({
  confidence,
  reasoning,
}: {
  confidence: Confidence | null | undefined;
  reasoning?: string | null;
}) {
  if (!confidence) return <Text color="secondary">—</Text>;

  const badge = (
    <Badge variant={CONFIDENCE_HUE[confidence]} label={CONFIDENCE_LABELS[confidence]} />
  );

  // The model's reasoning is one line and belongs on hover, not in the row.
  return reasoning ? <Tooltip content={reasoning}>{badge}</Tooltip> : badge;
}

export function ChannelBadge({channel}: {channel: Channel | null | undefined}) {
  if (!channel) return <Text color="secondary">—</Text>;
  return <Text>{CHANNEL_LABELS[channel]}</Text>;
}

/** The brand price tag. Reserved for prices — everywhere else uses plain text. */
export function PriceTag({
  value,
  isSold = false,
}: {
  value: number | null | undefined;
  isSold?: boolean;
}) {
  if (value == null) return <Text color="secondary">—</Text>;
  return (
    <Badge
      variant={isSold ? 'tag-sold' : 'tag'}
      label={formatEuro(value)}
    />
  );
}

export function formatEuro(value: number | null | undefined): string {
  if (value == null) return '—';
  return new Intl.NumberFormat('nl-BE', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: Number.isInteger(Number(value)) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(Number(value));
}

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null || !Number.isFinite(bytes)) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value < 10 && unit > 0 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}

export function lotLabel(lotNumber: number): string {
  return String(lotNumber).padStart(4, '0');
}
