'use client';

import {useRef} from 'react';
import {Button} from '@astryxdesign/core/Button';
import {NumberInput} from '@astryxdesign/core/NumberInput';
import {Section} from '@astryxdesign/core/Section';
import {Stack} from '@astryxdesign/core/Stack';
import {Text} from '@astryxdesign/core/Text';
import {TextInput} from '@astryxdesign/core/TextInput';
import {Tooltip} from '@astryxdesign/core/Tooltip';

import {askFromRetail, floorFromAsk, ladderPreview} from '@/src/lib/pricing';
import type {AppraisalQuestion, ItemWithImages} from '@/src/lib/types';
import {formatEuro} from './common';

/**
 * The appraiser's questions, as a checklist.
 *
 * This is the loop that actually moves prices. The model can only squint at a
 * photograph; the person reading this is holding the object under a lamp. Each
 * answer goes back as established fact and outranks whatever the photographs
 * suggested, which is how an unmarked "guessing" vase becomes a priced one.
 */
export function QuestionChecklist({
  questions,
  onAnswer,
  onSubmit,
  isBusy,
}: {
  questions: AppraisalQuestion[];
  onAnswer: (id: string, answer: string) => void;
  onSubmit: () => void;
  isBusy: boolean;
}) {
  const answered = questions.filter((question) => question.answer?.trim()).length;
  const outstanding = questions.length - answered;

  return (
    <Section variant="muted" padding={3}>
      <Stack direction="vertical" gap={3}>
        <Stack direction="vertical" gap={1}>
          <Text weight="semibold">
            {outstanding > 0
              ? `${outstanding} question${outstanding === 1 ? '' : 's'} about this object`
              : 'All questions answered'}
          </Text>
          <Text type="supporting" color="secondary">
            You have it in your hands. The appraiser only had a photograph.
          </Text>
        </Stack>

        {questions.map((question) => (
          <Stack key={question.id} direction="vertical" gap={1}>
            <Text weight="medium">{question.question}</Text>
            {question.why ? (
              <Text type="supporting" color="secondary">
                {question.why}
              </Text>
            ) : null}
            <Stack direction="horizontal" gap={2} vAlign="center" wrap="wrap">
              <Button
                size="sm"
                variant={question.answer === 'Yes' ? 'primary' : 'secondary'}
                label="Yes"
                onClick={() => onAnswer(question.id, 'Yes')}
              />
              <Button
                size="sm"
                variant={question.answer === 'No' ? 'primary' : 'secondary'}
                label="No"
                onClick={() => onAnswer(question.id, 'No')}
              />
              <TextInput
                label={`Answer: ${question.question}`}
                isLabelHidden
                size="sm"
                width={280}
                placeholder="…or describe what you see"
                value={
                  question.answer === 'Yes' || question.answer === 'No'
                    ? ''
                    : (question.answer ?? '')
                }
                onChange={(value) => onAnswer(question.id, value)}
              />
            </Stack>
          </Stack>
        ))}

        <Button
          variant="primary"
          label={`Re-appraise with ${answered} answer${answered === 1 ? '' : 's'}`}
          isDisabled={answered === 0}
          isLoading={isBusy}
          onClick={onSubmit}
        />
      </Stack>
    </Section>
  );
}

/**
 * The price ladder.
 *
 * Retail is the only number that needs judgement; ask and floor derive from it,
 * so editing retail moves both unless they have been overridden by hand. The
 * preview underneath answers the question the whole markdown scheme raises —
 * "and what will this be worth in six weeks if nobody bites?" — while the item
 * is still in front of you, rather than in two months when it has quietly
 * discounted itself to nothing.
 */
export function PriceLadderFields({
  draft,
  setDraft,
}: {
  draft: ItemWithImages;
  setDraft: (next: ItemWithImages) => void;
}) {
  const setRetail = (market: 'local' | 'intl', value: number | null) => {
    const ask = askFromRetail(value);
    setDraft({
      ...draft,
      [`retail_${market}`]: value,
      [`ask_${market}`]: ask,
      [`floor_${market}`]: floorFromAsk(ask),
    });
  };

  const preview = ladderPreview(draft.ask_local, draft.floor_local, 8);

  return (
    <Stack direction="vertical" gap={3}>
      <Text weight="semibold">Local price</Text>
      <Stack direction="horizontal" gap={2} wrap="wrap">
        <NumberInput
          label="Retail"
          units="EUR"
          min={0}
          width={140}
          value={draft.retail_local}
          onChange={(value) => setRetail('local', Number.isFinite(value) ? value : null)}
          description="What a consumer pays."
        />
        <NumberInput
          label="Ask"
          units="EUR"
          min={0}
          width={140}
          value={draft.ask_local}
          onChange={(value) =>
            setDraft({...draft, ask_local: Number.isFinite(value) ? value : null})
          }
          description="80% of retail."
        />
        <NumberInput
          label="Floor"
          units="EUR"
          min={0}
          width={140}
          value={draft.floor_local}
          onChange={(value) =>
            setDraft({...draft, floor_local: Number.isFinite(value) ? value : null})
          }
          description="Markdown stops here."
        />
      </Stack>

      <Text weight="semibold">International price</Text>
      <Stack direction="horizontal" gap={2} wrap="wrap">
        <NumberInput
          label="Retail (intl)"
          units="EUR"
          min={0}
          width={140}
          value={draft.retail_intl}
          onChange={(value) => setRetail('intl', Number.isFinite(value) ? value : null)}
        />
        <NumberInput
          label="Ask (intl)"
          units="EUR"
          min={0}
          width={140}
          value={draft.ask_intl}
          onChange={(value) =>
            setDraft({...draft, ask_intl: Number.isFinite(value) ? value : null})
          }
        />
        <NumberInput
          label="Floor (intl)"
          units="EUR"
          min={0}
          width={140}
          value={draft.floor_intl}
          onChange={(value) =>
            setDraft({...draft, floor_intl: Number.isFinite(value) ? value : null})
          }
        />
      </Stack>

      {preview.length > 0 ? (
        <Tooltip content="Minus 10% a week from the day it is listed, stopping at the floor. Once it reaches the floor it belongs in a lot rather than dropping further.">
          <Text type="supporting" color="secondary">
            If it sits:{' '}
            {[0, 2, 4, 6, 8]
              .map((week) => {
                const row = preview.find((entry) => entry.week === week);
                return row ? `wk ${week} ${formatEuro(row.price)}` : null;
              })
              .filter(Boolean)
              .join('  ·  ')}
          </Text>
        </Tooltip>
      ) : null}
    </Stack>
  );
}

/**
 * Drop zone for the shot the appraiser asked for.
 *
 * Without this the questioning loop is a dead end: the appraiser says
 * "photograph the base" and there is nowhere to put the result.
 */
export function AddPhotos({
  onFiles,
  isBusy,
}: {
  onFiles: (files: File[]) => void;
  isBusy: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <Stack direction="horizontal" gap={2} vAlign="center" wrap="wrap">
      <input
        ref={inputRef}
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp,image/tiff,image/avif,image/heic,image/heif"
        hidden
        onChange={(event) => {
          if (event.target.files) onFiles([...event.target.files]);
          event.target.value = '';
        }}
      />
      <Button
        size="sm"
        variant="secondary"
        label="Add photographs"
        isLoading={isBusy}
        onClick={() => inputRef.current?.click()}
      />
      <Text type="supporting" color="secondary">
        Copied into this lot. Never moved from where they are now.
      </Text>
    </Stack>
  );
}
