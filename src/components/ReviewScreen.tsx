'use client';

import {useCallback, useEffect, useMemo, useState} from 'react';
import {useRouter} from 'next/navigation';
import {Banner} from '@astryxdesign/core/Banner';
import {Button} from '@astryxdesign/core/Button';
import {CodeBlock} from '@astryxdesign/core/CodeBlock';
import {Divider} from '@astryxdesign/core/Divider';
import {EmptyState} from '@astryxdesign/core/EmptyState';
import {Heading} from '@astryxdesign/core/Heading';
import {Kbd} from '@astryxdesign/core/Kbd';
import {
  Layout,
  LayoutContent,
  LayoutFooter,
  LayoutHeader,
  LayoutPanel,
} from '@astryxdesign/core/Layout';
import {Lightbox} from '@astryxdesign/core/Lightbox';
import {NumberInput} from '@astryxdesign/core/NumberInput';
import {Section} from '@astryxdesign/core/Section';
import {Selector} from '@astryxdesign/core/Selector';
import {Spinner} from '@astryxdesign/core/Spinner';
import {Stack} from '@astryxdesign/core/Stack';
import {Text} from '@astryxdesign/core/Text';
import {TextArea} from '@astryxdesign/core/TextArea';
import {TextInput} from '@astryxdesign/core/TextInput';
import {Tooltip} from '@astryxdesign/core/Tooltip';
import {useToast} from '@astryxdesign/core/Toast';
import {
  addImages,
  fetchItem,
  fetchItems,
  fetchMeta,
  patchItem,
  requeueAppraisal,
} from '@/src/lib/client';
import {
  AddPhotos,
  AnsweredFacts,
  PriceLadderFields,
  QuestionChecklist,
} from './ReviewFields';
import type {
  AnsweredQuestion,
  AppraisalJob,
  AppraisalQuestion,
  Channel,
  Confidence,
  ItemWithImages,
} from '@/src/lib/types';
import {
  CATEGORY_OPTIONS,
  CHANNEL_OPTIONS,
  COLOUR_OPTIONS,
  CONDITION_OPTIONS,
  CONFIDENCE_OPTIONS,
  ConfidenceBadge,
  MATERIAL_OPTIONS,
  STYLE_OPTIONS,
  lotLabel,
} from './common';

/** One stable empty array, so an item with no images does not re-run memos. */
const NO_IMAGES: ItemWithImages['images'] = [];

const NO_QUESTIONS: AppraisalQuestion[] = [];

const NO_ANSWERED: AnsweredQuestion[] = [];

/**
 * One item at a time, keyboard-driven. Hundreds of these get processed in a
 * sitting, so the mouse is optional: J/K walk the queue, Enter confirms,
 * R re-appraises, arrow keys page the gallery.
 */
export function ReviewScreen() {
  const router = useRouter();
  const toast = useToast();
  const [queue, setQueue] = useState<ItemWithImages[] | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [index, setIndex] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [isZoomed, setIsZoomed] = useState(false);
  const [lotGroups, setLotGroups] = useState<string[]>([]);
  const [isReappraising, setIsReappraising] = useState(false);
  const [isAttaching, setIsAttaching] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({
      status: 'draft',
      limit: '200',
      sort: 'lot_number',
      dir: 'asc',
    });
    fetchItems(params).then(
      ({items}) => {
        if (!cancelled) setQueue(items);
      },
      (caught: unknown) => {
        if (!cancelled) {
          setQueue([]);
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
  }, [reloadToken, toast]);
  useEffect(() => {
    let cancelled = false;
    fetchMeta().then(
      ({lotGroups: groups}) => {
        if (!cancelled) setLotGroups(groups);
      },
      () => undefined,
    );
    return () => {
      cancelled = true;
    };
  }, [reloadToken]);
  const isLoading = queue === null;
  const rows = queue ?? [];
  const current = rows[index] ?? null;

  /**
   * Three pieces of per-item state — the full record, the user's edits, and
   * which photograph is showing — are each stamped with the item they belong
   * to and read back during render. Moving to the next lot therefore resets
   * them for free, with no effect reaching in to clear anything.
   */
  const [detail, setDetail] = useState<{
    id: string;
    item: ItemWithImages;
    job: AppraisalJob | null;
  } | null>(null);
  const [edits, setEdits] = useState<{id: string; item: ItemWithImages} | null>(null);
  const [gallery, setGallery] = useState<{id: string; index: number} | null>(null);
  const [note, setNote] = useState<{id: string; text: string} | null>(null);

  // Load the full record for the item in focus. The list gives enough for a
  // row; Review needs the appraisal job too.
  useEffect(() => {
    if (!current) return;
    const id = current.id;
    let cancelled = false;
    fetchItem(id).then(
      ({item, job: latest}) => {
        if (!cancelled) setDetail({id, item, job: latest});
      },
      () => undefined,
    );
    return () => {
      cancelled = true;
    };
  }, [current]);

  // `current` is checked explicitly rather than optional-chained on both sides:
  // with an empty queue both ids are undefined, `undefined === undefined` is
  // true, and the branch would read `.item` off a null detail.
  const base = current && detail?.id === current.id ? detail.item : current;
  const draft = current && edits?.id === current.id ? edits.item : base;
  const job = current && detail?.id === current.id ? detail.job : null;
  const imageIndex = current && gallery?.id === current.id ? gallery.index : 0;
  const reappraiseNote = current && note?.id === current.id ? note.text : '';
  const setDraft = useCallback(
    (next: ItemWithImages) => setEdits({id: next.id, item: next}),
    [],
  );
  const setImageIndex = useCallback(
    (next: number | ((current: number) => number)) => {
      if (!current) return;
      const id = current.id;
      setGallery((existing) => {
        const from = existing?.id === id ? existing.index : 0;
        return {id, index: typeof next === 'function' ? next(from) : next};
      });
    },
    [current],
  );
  const setReappraiseNote = useCallback(
    (text: string) => {
      if (current) setNote({id: current.id, text});
    },
    [current],
  );
  const advance = useCallback(
    (delta: number) => {
      setIndex((currentIndex) => {
        const next = currentIndex + delta;
        if (next < 0) return 0;
        if (next >= rows.length) return Math.max(0, rows.length - 1);
        return next;
      });
    },
    [rows.length],
  );

  /**
   * Takes the item out of the queue and lands on the next one — or leaves for
   * the Inventory when that was the last one.
   *
   * Sitting on the final item after dealing with it is a dead end: the buttons
   * still work, they just do nothing you can see, and it reads as the app being
   * stuck rather than the queue being finished.
   */
  const dropCurrent = useCallback(
    (doneMessage?: string) => {
      const remaining = rows.length - 1;
      setQueue((existing) => (existing ?? []).filter((_, i) => i !== index));
      setIndex((currentIndex) => Math.min(currentIndex, Math.max(0, remaining - 1)));
      if (remaining === 0) {
        toast({body: doneMessage ?? 'Review queue finished.'});
        router.push('/');
      }
    },
    [index, rows.length, router, toast],
  );
  const save = useCallback(
    async (
      patch: Record<string, unknown>,
      {removeFromQueue = false} = {},
      doneMessage?: string,
    ) => {
      if (!draft) return;
      setIsSaving(true);
      try {
        const {item} = await patchItem(draft.id, patch);
        setDraft(item);
        setQueue((existing) =>
          (existing ?? []).map((row) => (row.id === item.id ? item : row)),
        );
        if (removeFromQueue) dropCurrent(doneMessage);
      } catch (caught) {
        toast({
          type: 'error',
          body: caught instanceof Error ? caught.message : String(caught),
        });
      } finally {
        setIsSaving(false);
      }
    },
    [draft, dropCurrent, setDraft, toast],
  );

  /**
   * Confirm writes every edited field at once, not just the status. Anything
   * typed in the panel is already on `draft`; this is the moment it lands.
   */
  const confirm = useCallback(async () => {
    if (!draft) return;
    await save(
      {
        title_nl: draft.title_nl,
        title_en: draft.title_en,
        category: draft.category,
        shopify_category: draft.shopify_category,
        material: draft.material,
        material_detail: draft.material_detail,
        colour: draft.colour,
        colour_detail: draft.colour_detail,
        style: draft.style,
        era: draft.era,
        height_cm: draft.height_cm,
        width_cm: draft.width_cm,
        depth_cm: draft.depth_cm,
        diameter_cm: draft.diameter_cm,
        weight_g: draft.weight_g,
        dimensions_cm: draft.dimensions_cm,
        maker: draft.maker,
        marks_found: draft.marks_found,
        marks_to_check: draft.marks_to_check,
        condition_grade: draft.condition_grade,
        condition: draft.condition,
        retail_local: draft.retail_local,
        ask_local: draft.ask_local,
        floor_local: draft.floor_local,
        retail_intl: draft.retail_intl,
        ask_intl: draft.ask_intl,
        floor_intl: draft.floor_intl,
        owner_name: draft.owner_name,
        owner_contact: draft.owner_contact,
        owner_split_pct: draft.owner_split_pct,
        channel: draft.channel,
        confidence: draft.confidence,
        lot_group: draft.lot_group,
        notes: draft.notes,
        facts: draft.facts as unknown as Record<string, unknown>,
        status: 'appraised',
      },
      {removeFromQueue: true},
      `Lot ${lotLabel(draft.lot_number)} confirmed — that was the last one.`,
    );
    toast({body: `Lot ${lotLabel(draft.lot_number)} confirmed.`});
  }, [draft, save, toast]);
  const questions = draft?.facts?.questions ?? NO_QUESTIONS;
  const answeredFacts = draft?.facts?.answered ?? NO_ANSWERED;

  /**
   * Sends the answers back as established fact and re-runs the appraisal.
   * Saves them first, so a failed re-run does not lose what you just checked.
   */
  const reappraiseWithAnswers = useCallback(async () => {
    if (!draft) return;
    const answered = questions.filter((question) => question.answer?.trim());
    if (answered.length === 0) return;
    setIsReappraising(true);
    try {
      await patchItem(draft.id, {
        facts: {...(draft.facts ?? {}), questions} as never,
      });
      await requeueAppraisal(
        draft.id,
        undefined,
        answered.map((question) => ({
          id: question.id,
          question: question.question,
          answer: question.answer as string,
        })),
      );
      toast({
        body: `Lot ${lotLabel(draft.lot_number)} sent back with ${answered.length} answer${answered.length === 1 ? '' : 's'}. If the appraiser has nothing left to ask it confirms itself; otherwise it returns to this queue.`,
      });
      // It is being re-processed, so it does not belong in the queue any more.
      // Refresh brings it back if the appraiser still wants something.
      dropCurrent(
        `Lot ${lotLabel(draft.lot_number)} sent back — that was the last one in the queue.`,
      );
    } catch (caught) {
      toast({
        type: 'error',
        body: caught instanceof Error ? caught.message : String(caught),
      });
    } finally {
      setIsReappraising(false);
    }
  }, [draft, questions, dropCurrent, toast]);

  /** Adds photographs to this lot — the base shot the appraiser asked for. */
  const attachPhotos = useCallback(
    async (files: File[]) => {
      if (!draft || files.length === 0) return;
      setIsAttaching(true);
      try {
        const {item, added, warnings} = await addImages(draft.id, files);
        setDraft(item);
        setQueue((existing) =>
          (existing ?? []).map((row) => (row.id === item.id ? item : row)),
        );
        toast({
          body: `${added} photograph${added === 1 ? '' : 's'} added to lot ${lotLabel(draft.lot_number)}. Re-appraise to use them.`,
        });
        for (const warning of warnings) {
          toast({type: 'error', body: warning, isAutoHide: false});
        }
      } catch (caught) {
        toast({
          type: 'error',
          body: caught instanceof Error ? caught.message : String(caught),
        });
      } finally {
        setIsAttaching(false);
      }
    },
    [draft, setDraft, toast],
  );
  const reappraise = useCallback(async () => {
    if (!draft) return;
    setIsReappraising(true);
    try {
      await requeueAppraisal(draft.id, reappraiseNote.trim() || undefined);
      toast({body: `Lot ${lotLabel(draft.lot_number)} sent back for re-appraisal.`});
      setReappraiseNote('');
      dropCurrent(
        `Lot ${lotLabel(draft.lot_number)} sent back — that was the last one in the queue.`,
      );
    } catch (caught) {
      toast({
        type: 'error',
        body: caught instanceof Error ? caught.message : String(caught),
      });
    } finally {
      setIsReappraising(false);
    }
  }, [draft, reappraiseNote, setReappraiseNote, dropCurrent, toast]);
  const images = draft?.images ?? NO_IMAGES;

  // Keyboard: J/K walk the queue, Enter confirms, R re-appraises, arrows page
  // the gallery. Suppressed whenever focus is inside a field, so typing a title
  // containing "j" does not jump to the next lot.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTyping =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.isContentEditable === true ||
        target?.getAttribute('role') === 'combobox';
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === 'Escape' && isZoomed) {
        setIsZoomed(false);
        return;
      }
      if (isTyping) return;
      switch (event.key) {
        case 'j':
        case 'J':
          event.preventDefault();
          advance(1);
          break;
        case 'k':
        case 'K':
          event.preventDefault();
          advance(-1);
          break;
        case 'Enter':
          event.preventDefault();
          void confirm();
          break;
        case 'r':
        case 'R':
          event.preventDefault();
          void reappraise();
          break;
        case 'ArrowRight':
          if (images.length > 1) {
            event.preventDefault();
            setImageIndex((i) => (i + 1) % images.length);
          }
          break;
        case 'ArrowLeft':
          if (images.length > 1) {
            event.preventDefault();
            setImageIndex((i) => (i - 1 + images.length) % images.length);
          }
          break;
        default:
          break;
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [advance, confirm, reappraise, setImageIndex, images.length, isZoomed]);
  const lightboxMedia = useMemo(
    () =>
      images
        .filter((image) => image.url)
        .map((image) => ({
          type: 'image' as const,
          src: image.url as string,
          alt: image.original_name ?? '',
        })),
    [images],
  );
  if (isLoading) {
    return (
      <Section padding={8}>
        <Stack direction="horizontal" gap={2} vAlign="center" hAlign="center">
          <Spinner size="md" label="Loading the review queue" />
          <Text color="secondary">Loading the review queue…</Text>
        </Stack>
      </Section>
    );
  }
  if (!draft) {
    return (
      <Section padding={8}>
        <EmptyState
          title="Nothing to review"
          description="Every draft has been confirmed. Drop another object on the Ingest screen, or go and look at the inventory."
          actions={
            <Stack direction="horizontal" gap={2}>
              <Button variant="primary" label="Ingest" href="/ingest" />
              <Button variant="secondary" label="Inventory" href="/" />
            </Stack>
          }
        />
      </Section>
    );
  }
  const active = images[imageIndex] ?? images[0];
  const isFailed = job?.status === 'failed';
  const isPending = job?.status === 'queued' || job?.status === 'running';
  const notAppraisedYet = !draft.title_nl && !draft.title_en;
  return (
    <>
      <Layout
        height="fill"
        header={
          <LayoutHeader hasDivider>
            <Stack
              direction="horizontal"
              hAlign="between"
              vAlign="center"
              gap={4}
              padding={4}
              wrap="wrap"
            >
              <Stack direction="horizontal" gap={3} vAlign="center">
                <Heading level={1}>Review</Heading>
                <Text color="secondary">
                  Lot {lotLabel(draft.lot_number)} · {index + 1} of {rows.length}
                </Text>
                <ConfidenceBadge
                  confidence={draft.confidence as Confidence | null}
                  reasoning={draft.facts?.reasoning ?? null}
                />
              </Stack>
              <Stack direction="horizontal" gap={2} vAlign="center">
                {/* Items keep finishing their appraisal while you review, so the
                    queue is worth re-reading without leaving the screen. */}
                <Button
                  size="sm"
                  variant="ghost"
                  label="Refresh queue"
                  onClick={() => setReloadToken((token) => token + 1)}
                />
                <Divider orientation="vertical" />
                <Kbd keys="J" />
                <Text type="supporting" color="secondary">
                  next
                </Text>
                <Kbd keys="K" />
                <Text type="supporting" color="secondary">
                  prev
                </Text>
                <Kbd keys="Enter" />
                <Text type="supporting" color="secondary">
                  confirm
                </Text>
                <Kbd keys="R" />
                <Text type="supporting" color="secondary">
                  re-appraise
                </Text>
              </Stack>
            </Stack>
          </LayoutHeader>
        }
        content={
          <LayoutContent isScrollable padding={4}>
            <Stack direction="vertical" gap={3}>
              {active?.url ? (
                <button
                  type="button"
                  aria-label="Open this photograph full size"
                  onClick={() => setIsZoomed(true)}
                  className="block cursor-zoom-in overflow-hidden rounded-lg border border-border bg-surface p-0"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- signed Supabase URL */}
                  <img
                    src={active.url}
                    alt={active.original_name ?? `Lot ${lotLabel(draft.lot_number)}`}
                    className="max-h-[58vh] w-full object-contain"
                  />
                </button>
              ) : (
                <Section variant="muted" padding={8}>
                  <Text color="secondary">No web copy available for this lot.</Text>
                </Section>
              )}
              {images.length > 1 ? (
                <Stack direction="horizontal" gap={2} wrap="wrap">
                  {images.map((image, i) => (
                    <button
                      key={image.id}
                      type="button"
                      aria-label={`Show photograph ${i + 1} of ${images.length}`}
                      aria-pressed={i === imageIndex}
                      onClick={() => setImageIndex(i)}
                      className={[
                        'block cursor-pointer overflow-hidden rounded-md border-2 p-0',
                        i === imageIndex ? 'border-accent' : 'border-border hover:border-strong',
                      ].join(' ')}
                    >
                      {image.url ? (
                        // eslint-disable-next-line @next/next/no-img-element -- signed Supabase URL
                        <img src={image.url} alt="" width={72} height={72} className="size-18 object-cover" />
                      ) : (
                        <span aria-hidden className="block size-18 bg-body" />
                      )}
                    </button>
                  ))}
                </Stack>
              ) : null}
              <Stack direction="horizontal" gap={3} vAlign="center" hAlign="between" wrap="wrap">
                <Text type="supporting" color="secondary">
                  Click to zoom — mark shots need real magnification.{' '}
                  {images.length > 1 ? 'Arrow keys page the gallery.' : ''}
                </Text>
                <AddPhotos onFiles={(files) => void attachPhotos(files)} isBusy={isAttaching} />
              </Stack>
            </Stack>
          </LayoutContent>
        }
        end={
          <LayoutPanel width={480} hasDivider isScrollable label="Appraisal fields">
            <Stack direction="vertical" gap={4} padding={4}>
              {/* Nothing gets confirmed past this. A mark on the base can move
                  the price a whole bracket, so it sits above every field. */}
              {draft.marks_to_check ? (
                <Banner
                  status="warning"
                  title="Check this before confirming"
                  description={draft.marks_to_check}
                />
              ) : null}
              {isFailed ? (
                <Banner
                  status="error"
                  title="The appraisal failed"
                  description={job?.error ?? 'No error recorded.'}
                  collapsible={{defaultIsOpen: false}}
                >
                  <CodeBlock
                    language="json"
                    code={JSON.stringify(job?.raw_output ?? null, null, 2)}
                  />
                </Banner>
              ) : null}
              {/* The appraiser had a photograph; you have the object and a
                  torch. Answering these is what turns "guessing" into a price
                  bracket, so they sit above the fields, not below them. */}
              {questions.length > 0 ? (
                <QuestionChecklist
                  questions={questions}
                  onAnswer={(id, answer) => {
                    const next = questions.map((question) =>
                      question.id === id ? {...question, answer} : question,
                    );
                    setDraft({
                      ...draft,
                      facts: {...(draft.facts ?? {}), questions: next},
                    });
                  }}
                  onSubmit={() => void reappraiseWithAnswers()}
                  isBusy={isReappraising}
                />
              ) : null}
              <AnsweredFacts facts={answeredFacts} />

              {isPending ? (
                <Banner
                  status="info"
                  title="Still appraising"
                  description="This lot is in the queue. The fields below will fill in when it comes back."
                />
              ) : notAppraisedYet ? (
                <Banner
                  status="info"
                  title="Not appraised yet"
                  description="Fill the fields by hand, or send it to the appraiser with the button at the bottom."
                />
              ) : null}
              <Stack direction="vertical" gap={3}>
                <TextInput
                  label="Title (NL)"
                  value={draft.title_nl ?? ''}
                  onChange={(value) => setDraft({...draft, title_nl: value || null})}
                  description="Object, material, style/era, size. No adjectives."
                />
                <TextInput
                  label="Title (EN)"
                  value={draft.title_en ?? ''}
                  onChange={(value) => setDraft({...draft, title_en: value || null})}
                />
                <Selector
                  label="Product type"
                  hasSearch
                  value={draft.shopify_category ?? ''}
                  onChange={(value) =>
                    setDraft({...draft, shopify_category: String(value) || null})
                  }
                  options={CATEGORY_OPTIONS}
                  description="Shopify category — this is what customers filter by."
                />
                <Stack direction="horizontal" gap={3}>
                  <Selector
                    label="Material"
                    hasSearch
                    value={draft.material ?? ''}
                    onChange={(value) => setDraft({...draft, material: String(value) || null})}
                    options={MATERIAL_OPTIONS}
                  />
                  <TextInput
                    label="Material detail"
                    value={draft.material_detail ?? ''}
                    onChange={(value) => setDraft({...draft, material_detail: value || null})}
                    description="lead crystal, sommerso cased glass…"
                  />
                </Stack>
                <Stack direction="horizontal" gap={3}>
                  <Selector
                    label="Colour"
                    hasSearch
                    value={draft.colour ?? ''}
                    onChange={(value) => setDraft({...draft, colour: String(value) || null})}
                    options={COLOUR_OPTIONS}
                  />
                  <TextInput
                    label="Colour detail"
                    value={draft.colour_detail ?? ''}
                    onChange={(value) => setDraft({...draft, colour_detail: value || null})}
                    description="amber over clear…"
                  />
                </Stack>
                <Stack direction="horizontal" gap={3}>
                  <Selector
                    label="Style"
                    hasSearch
                    value={draft.style ?? ''}
                    onChange={(value) => setDraft({...draft, style: String(value) || null})}
                    options={STYLE_OPTIONS}
                  />
                  <TextInput
                    label="Era"
                    value={draft.era ?? ''}
                    onChange={(value) => setDraft({...draft, era: value || null})}
                    description="1960s, late 19th century…"
                  />
                </Stack>
                {/* Numbers, not prose — the storefront filters on size, and the
                    international price depends on what it costs to post. */}
                <Stack direction="horizontal" gap={2} wrap="wrap">
                  <NumberInput
                    label="Height"
                    units="cm"
                    min={0}
                    width={110}
                    value={draft.height_cm}
                    onChange={(value) =>
                      setDraft({...draft, height_cm: Number.isFinite(value) ? value : null})
                    }
                  />
                  <NumberInput
                    label="Width"
                    units="cm"
                    min={0}
                    width={110}
                    value={draft.width_cm}
                    onChange={(value) =>
                      setDraft({...draft, width_cm: Number.isFinite(value) ? value : null})
                    }
                  />
                  <NumberInput
                    label="Depth"
                    units="cm"
                    min={0}
                    width={110}
                    value={draft.depth_cm}
                    onChange={(value) =>
                      setDraft({...draft, depth_cm: Number.isFinite(value) ? value : null})
                    }
                  />
                  <NumberInput
                    label="Diameter"
                    units="cm"
                    min={0}
                    width={110}
                    value={draft.diameter_cm}
                    onChange={(value) =>
                      setDraft({...draft, diameter_cm: Number.isFinite(value) ? value : null})
                    }
                  />
                  <NumberInput
                    label="Weight"
                    units="g"
                    min={0}
                    width={120}
                    isIntegerOnly
                    value={draft.weight_g}
                    onChange={(value) =>
                      setDraft({...draft, weight_g: Number.isFinite(value) ? value : null})
                    }
                  />
                </Stack>
                <TextInput
                  label="Maker"
                  value={draft.maker ?? ''}
                  onChange={(value) => setDraft({...draft, maker: value || null})}
                  description="Only from a mark you can read."
                />
                <TextInput
                  label="Marks found"
                  value={draft.marks_found ?? ''}
                  onChange={(value) => setDraft({...draft, marks_found: value || null})}
                />
                <TextInput
                  label="Marks to check"
                  value={draft.marks_to_check ?? ''}
                  onChange={(value) => setDraft({...draft, marks_to_check: value || null})}
                  description="Clear it once you have looked."
                />
                <Selector
                  label="Condition grade"
                  value={draft.condition_grade ?? ''}
                  onChange={(value) =>
                    setDraft({...draft, condition_grade: String(value) || null})
                  }
                  options={CONDITION_OPTIONS}
                />
                <TextArea
                  label="Condition notes"
                  rows={2}
                  value={draft.condition ?? ''}
                  onChange={(value) => setDraft({...draft, condition: value || null})}
                  description="Only what is visible. Name the damage and where it is."
                />
              </Stack>
              <Divider />
              <PriceLadderFields draft={draft} setDraft={setDraft} />
              {draft.facts?.reasoning ? (
                <Tooltip content={draft.facts.reasoning}>
                  <Text type="supporting" color="secondary">
                    Why this price — hover to read the appraiser&rsquo;s note.
                  </Text>
                </Tooltip>
              ) : null}
              <Stack direction="horizontal" gap={3}>
                <Selector
                  label="Channel"
                  value={draft.channel ?? 'local'}
                  onChange={(value) => setDraft({...draft, channel: value as Channel})}
                  options={CHANNEL_OPTIONS}
                />
                <Selector
                  label="Confidence"
                  value={draft.confidence ?? 'guessing'}
                  onChange={(value) =>
                    setDraft({...draft, confidence: value as Confidence})
                  }
                  options={CONFIDENCE_OPTIONS}
                />
              </Stack>
              {draft.channel === 'lot' ? (
                <Stack direction="vertical" gap={2}>
                  <TextInput
                    label="Lot group"
                    value={draft.lot_group ?? ''}
                    placeholder="e.g. glassware-mixed-a"
                    onChange={(value) => setDraft({...draft, lot_group: value || null})}
                    description="Free text, or pick an existing group below."
                  />
                  {lotGroups.length > 0 ? (
                    <Selector
                      label="Existing groups"
                      isLabelHidden
                      variant="ghost"
                      hasSearch
                      placeholder="Use an existing group…"
                      value={draft.lot_group ?? ''}
                      onChange={(value) => setDraft({...draft, lot_group: String(value)})}
                      options={lotGroups.map((group) => ({value: group, label: group}))}
                    />
                  ) : null}
                </Stack>
              ) : null}
              <Divider />
              {/* Consignment. An estate clearer sells other people's things
                  constantly, and "whose was this again?" six months later is
                  not a question the books should have to guess at. */}
              <Stack direction="horizontal" gap={3}>
                <TextInput
                  label="Owner"
                  value={draft.owner_name ?? ''}
                  onChange={(value) =>
                    setDraft({...draft, owner_name: value || 'Weldam House'})
                  }
                  description="Weldam House for your own stock."
                />
                <NumberInput
                  label="Their share"
                  units="%"
                  min={0}
                  max={100}
                  width={130}
                  value={draft.owner_split_pct}
                  onChange={(value) =>
                    setDraft({
                      ...draft,
                      owner_split_pct: Number.isFinite(value) ? value : null,
                    })
                  }
                />
              </Stack>
              {draft.owner_name && draft.owner_name !== 'Weldam House' ? (
                <TextInput
                  label="Owner contact"
                  value={draft.owner_contact ?? ''}
                  onChange={(value) => setDraft({...draft, owner_contact: value || null})}
                />
              ) : null}
              <TextArea
                label="Notes"
                rows={2}
                value={draft.notes ?? ''}
                onChange={(value) => setDraft({...draft, notes: value || null})}
              />
              <Divider />
              <TextInput
                label="Re-appraisal instruction"
                placeholder="Base shot added — look again for an acid stamp"
                value={reappraiseNote}
                onChange={setReappraiseNote}
                description="Passed to the appraiser with the re-run. Optional."
              />
            </Stack>
          </LayoutPanel>
        }
        footer={
          <LayoutFooter hasDivider height={72} padding={3}>
            <Stack
              direction="horizontal"
              gap={2}
              hAlign="between"
              vAlign="center"
              wrap="wrap"
            >
              <Stack direction="horizontal" gap={2}>
                <Button
                  variant="ghost"
                  label="Previous"
                  isDisabled={index === 0}
                  onClick={() => advance(-1)}
                />
                <Button
                  variant="ghost"
                  label="Skip"
                  isDisabled={index >= rows.length - 1}
                  onClick={() => advance(1)}
                />
              </Stack>
              <Stack direction="horizontal" gap={2}>
                <Button
                  variant="destructive"
                  label="Scrap"
                  onClick={() =>
                    void save({status: 'scrapped', channel: 'scrap'}, {removeFromQueue: true})
                  }
                />
                <Button
                  variant="secondary"
                  label="Re-appraise"
                  isLoading={isReappraising}
                  onClick={() => void reappraise()}
                />
                <Button
                  variant="primary"
                  label="Confirm"
                  isLoading={isSaving}
                  onClick={() => void confirm()}
                />
              </Stack>
            </Stack>
          </LayoutFooter>
        }
      />
      {lightboxMedia.length > 0 ? (
        <Lightbox
          media={lightboxMedia}
          isOpen={isZoomed}
          onOpenChange={setIsZoomed}
          index={imageIndex}
          onIndexChange={setImageIndex}
          hasZoom
        />
      ) : null}
    </>
  );
}
