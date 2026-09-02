'use client';

import {Badge} from '@astryxdesign/core/Badge';
import {Stack} from '@astryxdesign/core/Stack';
import {Text} from '@astryxdesign/core/Text';
import {Tooltip} from '@astryxdesign/core/Tooltip';

import {ladderStep} from '@/src/lib/pricing';

import {
  COLOURS,
  CONDITION_LABELS,
  CONDITIONS,
  MATERIALS,
  SHOPIFY_CATEGORIES,
  STYLES,
} from '@/src/lib/taxonomy';
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

/**
 * Today's price on the markdown ladder.
 *
 * Shows the current figure, and — once the ladder has actually moved — the
 * original ask struck through beside it, so it is obvious at a glance which
 * items have been sitting. An item that has bottomed out gets a warning tone:
 * that is the cue to bundle it into a lot rather than keep discounting.
 */
export function LadderPrice({
  ask,
  floor,
  listedAt,
  isListed,
}: {
  ask: number | null | undefined;
  floor: number | null | undefined;
  listedAt: string | null | undefined;
  isListed: boolean;
}) {
  if (ask == null) return <Text color="secondary">—</Text>;

  // Before it is listed there is no clock running, so the ask is the price.
  if (!isListed || !listedAt) {
    return (
      <Text hasTabularNumbers>{formatEuro(ask)}</Text>
    );
  }

  const step = ladderStep(ask, floor, listedAt);
  if (step.weeks === 0 || step.discount <= 0) {
    return <Text hasTabularNumbers>{formatEuro(step.price)}</Text>;
  }

  return (
    <Tooltip
      content={`Listed ${step.weeks} week${step.weeks === 1 ? '' : 's'} ago — ${step.discountPct}% off the ${formatEuro(ask)} ask.${
        step.hasHitFloor ? ' It has hit its floor: lot it or scrap it.' : ''
      }`}
    >
      <Stack direction="horizontal" gap={1} vAlign="center">
        <Text
          hasTabularNumbers
          weight={step.hasHitFloor ? 'semibold' : 'normal'}
          color={step.hasHitFloor ? 'accent' : 'primary'}
        >
          {formatEuro(step.price)}
        </Text>
        <Text hasTabularNumbers type="supporting" color="secondary" hasStrikethrough>
          {formatEuro(ask)}
        </Text>
      </Stack>
    </Tooltip>
  );
}

export function MaterialCell({
  material,
  detail,
}: {
  material: string | null | undefined;
  detail?: string | null;
}) {
  if (!material) return <Text color="secondary">—</Text>;
  // The coarse Shopify facet is what shows; the precise trade word — the one
  // that actually sets the price — is one hover away.
  return detail ? (
    <Tooltip content={detail}>
      <Text maxLines={1}>{material}</Text>
    </Tooltip>
  ) : (
    <Text maxLines={1}>{material}</Text>
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

// --- option lists for the new controlled vocabularies ------------------------

export const CATEGORY_OPTIONS = SHOPIFY_CATEGORIES.map((category) => ({
  value: category.id,
  label: category.label,
  description: category.group,
}));

export const MATERIAL_OPTIONS = MATERIALS.map((value) => ({value, label: value}));
export const COLOUR_OPTIONS = COLOURS.map((value) => ({value, label: value}));
export const STYLE_OPTIONS = STYLES.map((value) => ({value, label: value}));
export const CONDITION_OPTIONS = CONDITIONS.map((value) => ({
  value,
  label: CONDITION_LABELS[value],
}));
