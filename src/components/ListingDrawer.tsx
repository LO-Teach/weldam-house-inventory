'use client';

import {useCallback, useState} from 'react';
import {Banner} from '@astryxdesign/core/Banner';
import {Button} from '@astryxdesign/core/Button';
import {Divider} from '@astryxdesign/core/Divider';
import {Heading} from '@astryxdesign/core/Heading';
import {IconButton} from '@astryxdesign/core/IconButton';
import {NumberInput} from '@astryxdesign/core/NumberInput';
import {Spinner} from '@astryxdesign/core/Spinner';
import {Stack} from '@astryxdesign/core/Stack';
import {StatusDot} from '@astryxdesign/core/StatusDot';
import {Tab, TabList} from '@astryxdesign/core/TabList';
import {Text} from '@astryxdesign/core/Text';
import {TextArea} from '@astryxdesign/core/TextArea';
import {TextInput} from '@astryxdesign/core/TextInput';
import {useToast} from '@astryxdesign/core/Toast';

import {
  copyToClipboard,
  generateListing,
  patchItem,
  saveListing,
} from '@/src/lib/client';
import {
  LISTING_CHANNELS,
  LISTING_CHANNEL_META,
  type ItemWithImages,
  type ListingChannel,
  type ListingCopy,
} from '@/src/lib/types';
import {PriceTag, formatEuro, lotLabel} from './common';

/**
 * Channel-specific listing copy, generated on demand from `facts`.
 *
 * The honest ceiling for the Dutch marketplaces is clipboard plus a prefilled
 * tab: neither 2dehands nor Marktplaats publishes a listing API, so "Open
 * listing page" opens the form and the paste is yours. eBay and Shopify could
 * be automated later; the drawer says which is which rather than implying every
 * button does the same thing.
 */
export function ListingDrawer({
  item,
  onClose,
  onItemChange,
}: {
  item: ItemWithImages;
  onClose: () => void;
  onItemChange: (item: ItemWithImages) => void;
}) {
  const toast = useToast();
  const [channel, setChannel] = useState<ListingChannel>('2dehands');
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const meta = LISTING_CHANNEL_META[channel];
  const cached = item.facts?.listings?.[channel] ?? null;

  /**
   * Local edits are stamped with the item and channel they belong to, so
   * switching tabs falls back to that channel's cached copy without an effect
   * having to reset anything. Typing in the eBay tab cannot leak into Catawiki.
   */
  const slot = `${item.id}:${channel}`;
  const [draft, setDraft] = useState<{slot: string; copy: ListingCopy} | null>(null);
  const copy = draft?.slot === slot ? draft.copy : cached;
  const isDirty = draft?.slot === slot && draft.copy !== cached;

  const setCopy = useCallback(
    (next: ListingCopy) => setDraft({slot, copy: next}),
    [slot],
  );

  /**
   * Both the generator and the save endpoint write the copy onto the item's
   * `facts`. Pushing that back up means `cached` is current and the local draft
   * can be dropped, so the "Save edits" button disappears the moment the edits
   * are actually saved.
   */
  const commitToItem = useCallback(
    (next: ListingCopy) => {
      onItemChange({
        ...item,
        facts: {
          ...(item.facts ?? {}),
          listings: {...(item.facts?.listings ?? {}), [channel]: next},
        },
      });
      setDraft(null);
    },
    [item, channel, onItemChange],
  );

  const generate = useCallback(
    async (regenerate: boolean) => {
      setIsGenerating(true);
      setError(null);
      try {
        const result = await generateListing(item.id, channel, regenerate);
        commitToItem(result.copy);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : String(caught));
      } finally {
        setIsGenerating(false);
      }
    },
    [item.id, channel, commitToItem],
  );

  const copyText = useCallback(
    async (label: string, text: string) => {
      const ok = await copyToClipboard(text);
      toast({
        type: ok ? 'info' : 'error',
        body: ok ? `${label} copied.` : `Could not reach the clipboard.`,
      });
    },
    [toast],
  );

  const persist = useCallback(async () => {
    if (!copy) return;
    try {
      await saveListing(item.id, channel, {
        title: copy.title,
        description: copy.description,
        price: copy.price,
      });
      commitToItem(copy);
      toast({body: 'Edited copy saved to the item.'});
    } catch (caught) {
      toast({
        type: 'error',
        body: caught instanceof Error ? caught.message : String(caught),
      });
    }
  }, [copy, item.id, channel, commitToItem, toast]);

  const markListed = useCallback(async () => {
    try {
      const {item: updated} = await patchItem(item.id, {status: 'listed'});
      onItemChange(updated);
      toast({body: `Lot ${lotLabel(item.lot_number)} marked listed.`});
    } catch (caught) {
      toast({
        type: 'error',
        body: caught instanceof Error ? caught.message : String(caught),
      });
    }
  }, [item.id, item.lot_number, onItemChange, toast]);

  const primary = item.images.find((image) => image.is_primary) ?? item.images[0];
  const titleOverBudget = (copy?.title.length ?? 0) > meta.titleMaxChars;

  return (
    <Stack direction="vertical" gap={4} padding={4}>
      <Stack direction="horizontal" hAlign="between" vAlign="start" gap={2}>
        <Stack direction="vertical" gap={1}>
          <Text type="supporting" color="secondary">
            Lot {lotLabel(item.lot_number)}
          </Text>
          <Heading level={2}>{item.title_nl ?? item.title_en ?? 'Untitled'}</Heading>
        </Stack>
        <IconButton icon="close" label="Close listing panel" variant="ghost" size="sm" onClick={onClose} />
      </Stack>

      <Stack direction="horizontal" gap={3} vAlign="center">
        {primary?.url ? (
          // eslint-disable-next-line @next/next/no-img-element -- signed URL, see InventoryScreen
          <img
            src={primary.url}
            alt=""
            width={64}
            height={64}
            className="size-16 rounded-sm border border-border object-cover"
          />
        ) : null}
        <Stack direction="vertical" gap={1}>
          <PriceTag value={item.price_local} isSold={item.status === 'sold'} />
          {item.price_intl != null ? (
            <Text type="supporting" color="secondary">
              {formatEuro(item.price_intl)} international
            </Text>
          ) : null}
        </Stack>
      </Stack>

      <Divider />

      <TabList
        aria-label="Listing channel"
        size="sm"
        value={channel}
        onChange={(value) => setChannel(value as ListingChannel)}
      >
        {LISTING_CHANNELS.map((value) => (
          <Tab
            key={value}
            value={value}
            label={LISTING_CHANNEL_META[value].label}
            endContent={
              item.facts?.listings?.[value] ? (
                <StatusDot variant="success" label="Copy already written" />
              ) : undefined
            }
          />
        ))}
      </TabList>

      <Text type="supporting" color="secondary">
        {meta.note}
      </Text>

      {error ? (
        <Banner status="error" title="Could not generate copy" description={error} />
      ) : null}

      {isGenerating ? (
        <Stack direction="horizontal" gap={2} vAlign="center" padding={4}>
          <Spinner size="sm" label="Writing copy" />
          <Text color="secondary">Writing {meta.label} copy…</Text>
        </Stack>
      ) : !copy ? (
        <Stack direction="vertical" gap={3} align="start">
          <Text color="secondary">
            No {meta.label} copy yet. It is written from this item&rsquo;s facts, in{' '}
            {meta.language === 'nl' ? 'Dutch' : 'English'}, sized for that platform.
          </Text>
          <Button
            variant="primary"
            label={`Generate ${meta.label} copy`}
            onClick={() => void generate(false)}
          />
        </Stack>
      ) : (
        <Stack direction="vertical" gap={3}>
          <Stack direction="vertical" gap={1}>
            <TextInput
              label="Title"
              value={copy.title}
              onChange={(value) => {
                setCopy({...copy, title: value});
              }}
              status={
                titleOverBudget
                  ? {
                      type: 'error',
                      message: `${copy.title.length} of ${meta.titleMaxChars} characters — ${meta.label} will truncate this.`,
                    }
                  : undefined
              }
              description={
                titleOverBudget
                  ? undefined
                  : `${copy.title.length} / ${meta.titleMaxChars} characters`
              }
            />
            <Stack direction="horizontal" gap={2}>
              <Button
                size="sm"
                variant="secondary"
                icon="copy"
                label="Copy title"
                onClick={() => void copyText('Title', copy.title)}
              />
            </Stack>
          </Stack>

          <Stack direction="vertical" gap={1}>
            <TextArea
              label="Description"
              rows={10}
              value={copy.description}
              onChange={(value) => {
                setCopy({...copy, description: value});
              }}
            />
            <Stack direction="horizontal" gap={2}>
              <Button
                size="sm"
                variant="secondary"
                icon="copy"
                label="Copy description"
                onClick={() => void copyText('Description', copy.description)}
              />
            </Stack>
          </Stack>

          <NumberInput
            label="Suggested price"
            units="EUR"
            min={0}
            value={copy.price}
            onChange={(value) => {
              setCopy({...copy, price: Number.isFinite(value) ? value : null});
            }}
          />

          <Divider />

          <Stack direction="horizontal" gap={2} wrap="wrap">
            <Button
              variant="primary"
              icon="copy"
              label="Copy all"
              onClick={() =>
                void copyText(
                  'Title, description and price',
                  `${copy.title}\n\n${copy.description}\n\n${
                    copy.price != null ? formatEuro(copy.price) : ''
                  }`.trim(),
                )
              }
            />
            <Button
              variant="secondary"
              icon="externalLink"
              label={`Open ${meta.label}`}
              href={meta.newListingUrl}
              target="_blank"
              rel="noreferrer noopener"
            />
            <Button
              variant="ghost"
              label="Regenerate"
              onClick={() => void generate(true)}
            />
            {isDirty ? (
              <Button variant="ghost" label="Save edits" onClick={() => void persist()} />
            ) : null}
          </Stack>

          <Text type="supporting" color="secondary">
            Generated {new Date(copy.generated_at).toLocaleString('nl-BE')}
          </Text>

          {item.status !== 'listed' && item.status !== 'sold' ? (
            <Button variant="secondary" label="Mark listed" onClick={() => void markListed()} />
          ) : null}
        </Stack>
      )}
    </Stack>
  );
}
