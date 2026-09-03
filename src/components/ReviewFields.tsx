'use client';

import {useRef} from 'react';
import {Button} from '@astryxdesign/core/Button';
import {Collapsible} from '@astryxdesign/core/Collapsible';
import {NumberInput} from '@astryxdesign/core/NumberInput';
import {Section} from '@astryxdesign/core/Section';
import {Stack} from '@astryxdesign/core/Stack';
import {Text} from '@astryxdesign/core/Text';
import {TextInput} from '@astryxdesign/core/TextInput';
import {Tooltip} from '@astryxdesign/core/Tooltip';

import {askFromRetail, floorFromAsk, ladderPreview} from '@/src/lib/pricing';
import type {
  AnsweredQuestion,
  AppraisalQuestion,
  ItemWithImages,
} from '@/src/lib/types';
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
          <QuestionRow key={question.id} question={question} onAnswer={onAnswer} />
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
 * What has already been established by hand.
 *
 * Worth showing even though the appraiser has stopped asking: it is proof the
 * answers were kept, and it stops you re-checking a base you already checked.
 */
export function AnsweredFacts({facts}: {facts: AnsweredQuestion[]}) {
  if (facts.length === 0) return null;
  return (
    <Collapsible
      trigger={`Checked by hand (${facts.length})`}
      defaultIsOpen={false}
    >
      <Stack direction="vertical" gap={2}>
        {facts.map((entry) => (
          <Stack key={entry.id} direction="vertical" gap={0}>
            <Text type="supporting" color="secondary">
              {entry.question}
            </Text>
            <Text weight="medium">{entry.answer}</Text>
          </Stack>
        ))}
      </Stack>
    </Collapsible>
  );
}

/** Yes/No, for the genuinely binary questions that arrive without options. */
const BINARY = ['Yes', 'No'];

/**
 * One question, its suggested answers, and an escape hatch.
 *
 * The options come from the appraiser because only it knows what the question
 * means: "is the base smooth or is there a mould seam" has two real answers and
 * neither is "yes". The free-text box stays for the case nobody anticipated —
 * which is also how the appraiser learns it asked a bad question.
 */
function QuestionRow({
  question,
  onAnswer,
}: {
  question: AppraisalQuestion;
  onAnswer: (id: string, answer: string) => void;
}) {
  const options = question.options?.length ? question.options : BINARY;
  const answer = question.answer ?? '';
  // An answer that is not one of the buttons is a typed one, and belongs in the
  // text box rather than vanishing.
  const isCustom = answer !== '' && !options.includes(answer);

  return (
    <Stack direction="vertical" gap={1}>
      <Text weight="medium">{question.question}</Text>
      {question.why ? (
        <Text type="supporting" color="secondary">
          {question.why}
        </Text>
      ) : null}
      <Stack direction="horizontal" gap={2} vAlign="center" wrap="wrap">
        {options.map((option) => (
          <Button
            key={option}
            size="sm"
            variant={answer === option ? 'primary' : 'secondary'}
            label={option}
            // Tapping the chosen answer again clears it, so a mis-tap is one
            // click to undo rather than a wrong fact sent to the appraiser.
            onClick={() => onAnswer(question.id, answer === option ? '' : option)}
          />
        ))}
        <TextInput
          label={`Answer: ${question.question}`}
          isLabelHidden
          size="sm"
          width={240}
          placeholder="…or say it in your own words"
          value={isCustom ? answer : ''}
          onChange={(value) => onAnswer(question.id, value)}
        />
      </Stack>
    </Stack>
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
