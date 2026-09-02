'use client';

import {useCallback, useEffect, useState} from 'react';
import {Button} from '@astryxdesign/core/Button';
import {Dialog} from '@astryxdesign/core/Dialog';
import {Divider} from '@astryxdesign/core/Divider';
import {EmptyState} from '@astryxdesign/core/EmptyState';
import {Heading} from '@astryxdesign/core/Heading';
import {NumberInput} from '@astryxdesign/core/NumberInput';
import {Section} from '@astryxdesign/core/Section';
import {Spinner} from '@astryxdesign/core/Spinner';
import {Stack} from '@astryxdesign/core/Stack';
import {Text} from '@astryxdesign/core/Text';
import {TextInput} from '@astryxdesign/core/TextInput';
import {useToast} from '@astryxdesign/core/Toast';

import {applyLot, fetchLotProposals, type LotProposal} from '@/src/lib/client';
import {formatEuro, lotLabel} from './common';

/**
 * Proposed bundles for everything too cheap — or too long unsold — to be worth
 * listing on its own.
 *
 * The grouping is arithmetic, not a model call, so it is instant and every
 * proposal can say exactly why those pieces are in a box together. Accepting
 * one is the only thing that writes.
 */
export function LotProposals({
  isOpen,
  onOpenChange,
  onApplied,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onApplied: () => void;
}) {
  const toast = useToast();
  const [maxRetail, setMaxRetail] = useState(20);
  const [targetSize, setTargetSize] = useState(6);
  /**
   * The request that produced the result travels with it, so "still loading"
   * is a comparison during render rather than a second piece of state an effect
   * has to reset.
   */
  const [loaded, setLoaded] = useState<{key: string; proposals: LotProposal[]} | null>(
    null,
  );
  const [reloadToken, setReloadToken] = useState(0);
  const [applying, setApplying] = useState<string | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});

  const requestKey = `${maxRetail}|${targetSize}|${reloadToken}`;

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    fetchLotProposals({maxRetail, targetSize}).then(
      ({proposals: next}) => {
        if (!cancelled) setLoaded({key: requestKey, proposals: next});
      },
      (caught: unknown) => {
        if (!cancelled) {
          setLoaded({key: requestKey, proposals: []});
          toast({
            type: 'error',
            body: caught instanceof Error ? caught.message : String(caught),
          });
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [isOpen, maxRetail, targetSize, requestKey, toast]);

  const proposals = loaded?.key === requestKey ? loaded.proposals : null;

  const accept = useCallback(
    async (proposal: LotProposal) => {
      const name = names[proposal.key]?.trim() || proposal.key;
      setApplying(proposal.key);
      try {
        const {updated} = await applyLot(
          name,
          proposal.items.map((item) => item.id),
        );
        toast({
          body: `${updated} item${updated === 1 ? '' : 's'} assigned to "${name}".`,
        });
        setReloadToken((token) => token + 1);
        onApplied();
      } catch (caught) {
        toast({
          type: 'error',
          body: caught instanceof Error ? caught.message : String(caught),
        });
      } finally {
        setApplying(null);
      }
    },
    [names, onApplied, toast],
  );

  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      width={880}
      maxHeight="86vh"
      purpose="form"
    >
      <Stack direction="vertical" gap={4} padding={4}>
        <Stack direction="vertical" gap={1}>
          <Heading level={2}>Proposed lots</Heading>
          <Text color="secondary">
            Cheap pieces, and anything that has bottomed out on the markdown
            ladder, grouped by what they have in common. Nothing changes until
            you accept a bundle.
          </Text>
        </Stack>

        <Stack direction="horizontal" gap={3} vAlign="end" wrap="wrap">
          <NumberInput
            label="Include up to"
            units="EUR retail"
            min={1}
            max={500}
            width={190}
            isIntegerOnly
            value={maxRetail}
            onChange={(value) => setMaxRetail(Number.isFinite(value) ? value : 20)}
          />
          <NumberInput
            label="Pieces per lot"
            min={2}
            max={20}
            width={150}
            isIntegerOnly
            value={targetSize}
            onChange={(value) => setTargetSize(Number.isFinite(value) ? value : 6)}
          />
          <Button
            variant="ghost"
            label="Recalculate"
            onClick={() => setReloadToken((token) => token + 1)}
          />
        </Stack>

        <Divider />

        {proposals === null ? (
          <Stack direction="horizontal" gap={2} vAlign="center" padding={6}>
            <Spinner size="md" label="Grouping items" />
            <Text color="secondary">Grouping…</Text>
          </Stack>
        ) : proposals.length === 0 ? (
          <EmptyState
            title="Nothing to bundle"
            description="No unlotted items are cheap enough or stale enough to be worth grouping. Raise the retail cap if you want to sweep more in."
          />
        ) : (
          <Stack direction="vertical" gap={4}>
            {proposals.map((proposal) => (
              <Section key={proposal.key} variant="muted" padding={3}>
                <Stack direction="vertical" gap={3}>
                  <Stack
                    direction="horizontal"
                    gap={3}
                    hAlign="between"
                    vAlign="start"
                    wrap="wrap"
                  >
                    <Stack direction="vertical" gap={1}>
                      <Text weight="semibold">{proposal.title}</Text>
                      <Text type="supporting" color="secondary">
                        {proposal.rationale}
                      </Text>
                    </Stack>
                    <Stack direction="vertical" gap={0} align="end">
                      <Text weight="semibold" hasTabularNumbers>
                        {formatEuro(proposal.suggestedPrice)}
                      </Text>
                      <Text type="supporting" color="secondary" hasTabularNumbers>
                        vs {formatEuro(proposal.sumIndividual)} separately
                      </Text>
                    </Stack>
                  </Stack>

                  <Stack direction="horizontal" gap={2} wrap="wrap">
                    {proposal.items.map((item) => (
                      <Stack key={item.id} direction="vertical" gap={1}>
                        {item.thumbUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={item.thumbUrl}
                            alt=""
                            width={56}
                            height={56}
                            className="size-14 rounded-sm border border-border object-cover"
                          />
                        ) : (
                          <span
                            aria-hidden
                            className="block size-14 rounded-sm border border-border bg-body"
                          />
                        )}
                        <Text type="supporting" color="secondary">
                          {lotLabel(item.lot_number)}
                        </Text>
                      </Stack>
                    ))}
                  </Stack>

                  <Stack direction="horizontal" gap={2} vAlign="end" wrap="wrap">
                    <TextInput
                      label="Lot group name"
                      size="sm"
                      width={320}
                      value={names[proposal.key] ?? proposal.key}
                      onChange={(value) =>
                        setNames((current) => ({...current, [proposal.key]: value}))
                      }
                    />
                    <Button
                      variant="primary"
                      size="sm"
                      label={`Accept — ${proposal.items.length} pieces`}
                      isLoading={applying === proposal.key}
                      onClick={() => void accept(proposal)}
                    />
                  </Stack>
                </Stack>
              </Section>
            ))}
          </Stack>
        )}

        <Stack direction="horizontal" gap={2} hAlign="end">
          <Button variant="secondary" label="Done" onClick={() => onOpenChange(false)} />
        </Stack>
      </Stack>
    </Dialog>
  );
}
