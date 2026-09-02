'use client';

import {useCallback, useEffect, useRef, useState} from 'react';
import {useRouter} from 'next/navigation';
import {Badge} from '@astryxdesign/core/Badge';
import {Banner} from '@astryxdesign/core/Banner';
import {Button} from '@astryxdesign/core/Button';
import {Divider} from '@astryxdesign/core/Divider';
import {EmptyState} from '@astryxdesign/core/EmptyState';
import {Heading} from '@astryxdesign/core/Heading';
import {
  Layout,
  LayoutContent,
  LayoutFooter,
  LayoutHeader,
} from '@astryxdesign/core/Layout';
import {Section} from '@astryxdesign/core/Section';
import {Spinner} from '@astryxdesign/core/Spinner';
import {Stack} from '@astryxdesign/core/Stack';
import {StatusDot} from '@astryxdesign/core/StatusDot';
import {Text} from '@astryxdesign/core/Text';
import {TextInput} from '@astryxdesign/core/TextInput';
import {Tooltip} from '@astryxdesign/core/Tooltip';
import {useToast} from '@astryxdesign/core/Toast';

import {
  createArchiveFolder,
  fetchArchiveStatus,
  fetchQueue,
  ingest,
  type ArchiveStatus,
  type QueueJob,
} from '@/src/lib/client';
import {JOB_STATUS_LABELS, type JobStatus} from '@/src/lib/types';
import {formatBytes, lotLabel} from './common';

const MAX_FILES = 12;
const MAX_BYTES = 15 * 1024 * 1024;
const ACCEPTED = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/tiff',
  'image/avif',
  'image/heic',
  'image/heif',
];

interface Staged {
  file: File;
  previewUrl: string;
}

const JOB_HUE: Record<JobStatus, 'gray' | 'teal' | 'green' | 'red'> = {
  queued: 'gray',
  running: 'teal',
  done: 'green',
  failed: 'red',
};

/**
 * The capture surface, deliberately thin: drop a group, name it in a few words
 * if you like, and move on. Appraisal takes 15-40 seconds per object, so
 * nothing here waits on it — the drop hands off to the queue and the zone
 * clears for the next thing on the table.
 */
export function IngestScreen() {
  const router = useRouter();
  const toast = useToast();

  const [archive, setArchive] = useState<ArchiveStatus | null>(null);
  const [staged, setStaged] = useState<Staged[]>([]);
  const [primaryIndex, setPrimaryIndex] = useState(0);
  const [hint, setHint] = useState('');
  const [rejections, setRejections] = useState<string[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [jobs, setJobs] = useState<QueueJob[]>([]);
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);

  useEffect(() => {
    void fetchArchiveStatus().then(setArchive, () => undefined);
  }, []);

  // The queue strip polls. Two seconds is often enough to feel live without
  // hammering a database that is answering ingest requests at the same time.
  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const {jobs: next} = await fetchQueue();
        if (!cancelled) setJobs(next);
      } catch {
        // A failed poll is not worth a toast; the next one usually works.
      }
    };
    void tick();
    const timer = setInterval(() => void tick(), 2000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  // Object URLs are a real leak if they are not revoked; staged previews can
  // turn over dozens of times in a session.
  useEffect(() => {
    return () => {
      for (const entry of staged) URL.revokeObjectURL(entry.previewUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- unmount only
  }, []);

  const acceptFiles = useCallback(
    (incoming: FileList | File[]) => {
      const files = [...incoming];
      const problems: string[] = [];
      const accepted: File[] = [];

      for (const file of files) {
        if (!ACCEPTED.includes(file.type)) {
          problems.push(
            `${file.name} is ${file.type || 'an unknown type'} — export camera RAW to JPEG before ingesting.`,
          );
          continue;
        }
        if (file.size > MAX_BYTES) {
          problems.push(
            `${file.name} is ${formatBytes(file.size)}, over the 15 MB limit.`,
          );
          continue;
        }
        accepted.push(file);
      }

      setStaged((current) => {
        const total = current.length + accepted.length;
        if (total > MAX_FILES) {
          problems.push(
            `That would be ${total} photographs of one object. A drop is one object — more than ${MAX_FILES} usually means two got mixed together.`,
          );
          setRejections((existing) => [...existing, ...problems]);
          return current;
        }
        setRejections(problems);
        for (const entry of current) void entry;
        return [
          ...current,
          ...accepted.map((file) => ({
            file,
            previewUrl: URL.createObjectURL(file),
          })),
        ];
      });
    },
    [],
  );

  const clearZone = useCallback(() => {
    setStaged((current) => {
      for (const entry of current) URL.revokeObjectURL(entry.previewUrl);
      return [];
    });
    setPrimaryIndex(0);
    setHint('');
    setRejections([]);
  }, []);

  const removeAt = useCallback((index: number) => {
    setStaged((current) => {
      const entry = current[index];
      if (entry) URL.revokeObjectURL(entry.previewUrl);
      return current.filter((_, i) => i !== index);
    });
    setPrimaryIndex((current) => (current >= index && current > 0 ? current - 1 : current));
  }, []);

  const submit = useCallback(async () => {
    if (staged.length === 0 || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const result = await ingest(
        staged.map((entry) => entry.file),
        {hint: hint.trim() || undefined, primaryIndex},
      );

      toast({
        body: `Lot ${lotLabel(result.lotNumber)} filed. Your photographs were copied, not moved — the files you dragged in are still exactly where they were.`,
      });
      for (const warning of result.warnings) {
        toast({type: 'error', body: warning, isAutoHide: false});
      }

      clearZone();
      void fetchArchiveStatus().then(setArchive, () => undefined);
      void fetchQueue().then(({jobs: next}) => setJobs(next), () => undefined);
    } catch (caught) {
      toast({
        type: 'error',
        body: caught instanceof Error ? caught.message : String(caught),
        isAutoHide: false,
      });
    } finally {
      setIsSubmitting(false);
    }
  }, [staged, hint, primaryIndex, isSubmitting, clearZone, toast]);

  /** One click from the blocked state to a working one. */
  const archiveRoot = archive?.archiveRoot;
  const createFolder = useCallback(async () => {
    if (!archiveRoot) return;
    setIsCreatingFolder(true);
    try {
      const result = await createArchiveFolder(archiveRoot);
      setArchive(result.archive);
      toast({
        body: result.archive.isReady
          ? `Created ${result.archive.archiveRoot}. Ingest is open.`
          : (result.archive.problem ?? 'Could not create the folder.'),
        type: result.archive.isReady ? 'info' : 'error',
      });
    } catch (caught) {
      toast({
        type: 'error',
        body: caught instanceof Error ? caught.message : String(caught),
      });
    } finally {
      setIsCreatingFolder(false);
    }
  }, [archiveRoot, toast]);

  const isBlocked = !archive?.isReady;

  return (
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
            <Stack direction="vertical" gap={1}>
              <Heading level={1}>Ingest</Heading>
              <Text color="secondary">
                One drop is one object. Drop the next one straight after — nothing
                here waits for the appraisal.
              </Text>
            </Stack>
            <ArchiveChip archive={archive} />
          </Stack>
        </LayoutHeader>
      }
      content={
        <LayoutContent isScrollable padding={4}>
          <Stack direction="vertical" gap={4}>
            {archive && !archive.isReady ? (
              <Banner
                status={archive.isMissing ? 'warning' : 'error'}
                title={
                  archive.isMissing
                    ? 'The archive folder does not exist yet'
                    : 'Archive folder unusable'
                }
                description={archive.problem ?? 'The archive folder is not reachable.'}
                endContent={
                  <Stack direction="horizontal" gap={2}>
                    {archive.isMissing ? (
                      <Button
                        size="sm"
                        variant="primary"
                        label="Create it"
                        isLoading={isCreatingFolder}
                        onClick={() => void createFolder()}
                      />
                    ) : null}
                    <Button size="sm" variant="secondary" label="Settings" href="/settings" />
                  </Stack>
                }
              />
            ) : null}

            {rejections.length > 0 ? (
              <Banner
                status="warning"
                title={`${rejections.length} file${rejections.length === 1 ? '' : 's'} not accepted`}
                isDismissable
                onDismiss={() => setRejections([])}
              >
                <Stack direction="vertical" gap={1}>
                  {rejections.map((problem) => (
                    <Text key={problem} type="supporting">
                      {problem}
                    </Text>
                  ))}
                </Stack>
              </Banner>
            ) : null}

            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept={ACCEPTED.join(',')}
              hidden
              onChange={(event) => {
                if (event.target.files) acceptFiles(event.target.files);
                event.target.value = '';
              }}
            />

            <section
              aria-label="Drop photographs of one object"
              onDragEnter={(event) => {
                event.preventDefault();
                dragDepth.current += 1;
                if (!isBlocked) setIsDragging(true);
              }}
              onDragOver={(event) => event.preventDefault()}
              onDragLeave={(event) => {
                event.preventDefault();
                dragDepth.current -= 1;
                if (dragDepth.current <= 0) setIsDragging(false);
              }}
              onDrop={(event) => {
                event.preventDefault();
                dragDepth.current = 0;
                setIsDragging(false);
                if (isBlocked) return;
                if (event.dataTransfer.files) acceptFiles(event.dataTransfer.files);
              }}
              className={[
                'rounded-lg border-2 border-dashed p-8 transition-colors',
                isBlocked
                  ? 'border-border bg-body opacity-60'
                  : isDragging
                    ? 'border-accent bg-accent-muted'
                    : 'border-strong bg-surface',
              ].join(' ')}
            >
              {staged.length === 0 ? (
                <EmptyState
                  title={isBlocked ? 'Ingest is disabled' : 'Drop one object here'}
                  description={
                    isBlocked
                      ? 'Nothing can be filed until the archive folder exists. The app will not quietly pick somewhere else instead.'
                      : `Drag them straight in from anywhere — the camera card, a downloads folder, the desktop. They are copied into the archive, never moved. Every photograph in one drop is treated as the same object: up to ${MAX_FILES} shots, JPEG or PNG, 15 MB each.`
                  }
                  actions={
                    isBlocked ? undefined : (
                      <Button
                        variant="secondary"
                        label="Choose files"
                        onClick={() => fileInputRef.current?.click()}
                      />
                    )
                  }
                />
              ) : (
                <Stack direction="vertical" gap={4}>
                  <Stack direction="horizontal" gap={3} wrap="wrap">
                    {staged.map((entry, index) => (
                      <Stack key={entry.previewUrl} direction="vertical" gap={1}>
                        <button
                          type="button"
                          aria-label={
                            index === primaryIndex
                              ? `${entry.file.name} is the primary shot`
                              : `Make ${entry.file.name} the primary shot`
                          }
                          aria-pressed={index === primaryIndex}
                          onClick={() => setPrimaryIndex(index)}
                          className={[
                            'block cursor-pointer overflow-hidden rounded-md border-2 p-0',
                            index === primaryIndex
                              ? 'border-accent'
                              : 'border-border hover:border-strong',
                          ].join(' ')}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element -- local object URL, never a remote asset */}
                          <img
                            src={entry.previewUrl}
                            alt=""
                            width={132}
                            height={132}
                            className="size-33 object-cover"
                          />
                        </button>
                        <Stack direction="horizontal" hAlign="between" vAlign="center" gap={1}>
                          <Text type="supporting" color="secondary" maxLines={1}>
                            {index === primaryIndex ? 'Primary' : formatBytes(entry.file.size)}
                          </Text>
                          <Button
                            size="sm"
                            variant="ghost"
                            label="Remove"
                            onClick={() => removeAt(index)}
                          />
                        </Stack>
                      </Stack>
                    ))}
                  </Stack>

                  <TextInput
                    label="Hint (optional)"
                    placeholder="ruby cut-to-clear vase"
                    description="Passed to the appraiser as a pointer to look at something. It is never treated as fact."
                    value={hint}
                    onChange={setHint}
                    width={420}
                    onEnter={() => void submit()}
                  />

                  <Stack direction="horizontal" gap={2} vAlign="center">
                    <Button
                      variant="primary"
                      label={`Add to queue (${staged.length} shot${staged.length === 1 ? '' : 's'})`}
                      isLoading={isSubmitting}
                      isDisabled={isBlocked}
                      onClick={() => void submit()}
                    />
                    <Button
                      variant="secondary"
                      label="Add more files"
                      onClick={() => fileInputRef.current?.click()}
                    />
                    <Button variant="ghost" label="Clear" onClick={clearZone} />
                  </Stack>
                </Stack>
              )}
            </section>
          </Stack>
        </LayoutContent>
      }
      footer={
        // Tall enough for a row of 56px thumbnails with their status badges;
        // the default footer height is sized for a single bar of controls.
        <LayoutFooter hasDivider height={172} padding={3}>
          <Stack direction="vertical" gap={2}>
            <Stack direction="horizontal" gap={2} vAlign="center">
              <Text weight="semibold">Queue</Text>
              <Text type="supporting" color="secondary">
                {jobs.filter((job) => job.status === 'queued' || job.status === 'running').length}{' '}
                outstanding
              </Text>
            </Stack>
            {jobs.length === 0 ? (
              <Text type="supporting" color="secondary">
                Nothing appraising. Drop an object above.
              </Text>
            ) : (
              <Stack direction="horizontal" gap={2} wrap="nowrap" isScrollable>
                {jobs.map((job) => (
                  <QueueChip key={job.id} job={job} onOpen={() => router.push('/review')} />
                ))}
              </Stack>
            )}
          </Stack>
        </LayoutFooter>
      }
    />
  );
}

function ArchiveChip({archive}: {archive: ArchiveStatus | null}) {
  if (!archive) {
    return (
      <Stack direction="horizontal" gap={2} vAlign="center">
        <Spinner size="sm" label="Checking the archive folder" />
        <Text color="secondary">Checking the archive folder…</Text>
      </Stack>
    );
  }

  return (
    <Section variant="muted" padding={3}>
      <Stack direction="horizontal" gap={4} vAlign="center" wrap="wrap">
        <Stack direction="horizontal" gap={2} vAlign="center">
          <StatusDot
            variant={archive.isReady ? 'success' : 'error'}
            label={archive.isReady ? 'Archive folder ready' : 'Archive folder unavailable'}
          />
          <Tooltip content={archive.archiveRoot || 'No folder chosen yet'}>
            <Text weight="medium" maxLines={1}>
              {archive.archiveRoot || 'Not configured'}
            </Text>
          </Tooltip>
        </Stack>
        {archive.isReady ? (
          <>
            <Divider orientation="vertical" />
            <Text color="secondary">{formatBytes(archive.freeBytes)} free</Text>
            <Text color="secondary">{archive.archivedCount ?? 0} lots filed</Text>
          </>
        ) : null}
      </Stack>
    </Section>
  );
}

function QueueChip({job, onOpen}: {job: QueueJob; onOpen: () => void}) {
  const status = job.status;
  const label = JOB_STATUS_LABELS[status];
  const lot = job.items ? lotLabel(job.items.lot_number) : '—';
  const isActionable = status === 'done';

  const body = (
    <Stack direction="vertical" gap={1}>
      {job.thumbUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- signed Supabase URL
        <img
          src={job.thumbUrl}
          alt=""
          width={56}
          height={56}
          className="size-14 rounded-sm border border-border object-cover"
        />
      ) : (
        <span aria-hidden className="block size-14 rounded-sm border border-border bg-body" />
      )}
      <Badge variant={JOB_HUE[status]} label={label} />
      <Text type="supporting" color="secondary">
        {lot}
      </Text>
    </Stack>
  );

  if (job.status === 'failed' && job.error) {
    return <Tooltip content={job.error}>{body}</Tooltip>;
  }

  return isActionable ? (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Lot ${lot} is ready — open Review`}
      className="cursor-pointer rounded-md border-0 bg-transparent p-0 text-left"
    >
      {body}
    </button>
  ) : (
    body
  );
}
