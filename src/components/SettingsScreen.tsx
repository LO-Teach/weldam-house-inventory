'use client';

import {useCallback, useEffect, useState} from 'react';
import {Banner} from '@astryxdesign/core/Banner';
import {Button} from '@astryxdesign/core/Button';
import {Divider} from '@astryxdesign/core/Divider';
import {Heading} from '@astryxdesign/core/Heading';
import {InputGroup} from '@astryxdesign/core/InputGroup';
import {Layout, LayoutContent, LayoutHeader} from '@astryxdesign/core/Layout';
import {MetadataList, MetadataListItem} from '@astryxdesign/core/MetadataList';
import {NumberInput} from '@astryxdesign/core/NumberInput';
import {Section} from '@astryxdesign/core/Section';
import {Spinner} from '@astryxdesign/core/Spinner';
import {Stack} from '@astryxdesign/core/Stack';
import {StatusDot} from '@astryxdesign/core/StatusDot';
import {Switch} from '@astryxdesign/core/Switch';
import {Text} from '@astryxdesign/core/Text';
import {TextInput} from '@astryxdesign/core/TextInput';
import {useToast} from '@astryxdesign/core/Toast';

import {
  browseForFolder,
  createArchiveFolder,
  fetchSettings,
  regenerateSidecars,
  saveSettings,
  type SettingsResponse,
} from '@/src/lib/client';
import {formatBytes} from './common';

/**
 * Where originals are filed and how big the web copies are.
 *
 * Secrets are deliberately absent: Supabase keys and the appraisal model come
 * from .env.local and are only reported here, never edited. A settings screen
 * that can write a service-role key into a JSON file is a settings screen that
 * will eventually log one.
 */
export function SettingsScreen() {
  const toast = useToast();
  const [data, setData] = useState<SettingsResponse | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [isBrowsing, setIsBrowsing] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  /**
   * The form fields are edits layered over whatever was last loaded, keyed by
   * the load that produced them. A reload therefore drops stale edits without
   * an effect having to copy values into separate state.
   */
  const [edits, setEdits] = useState<{
    token: number;
    archiveRoot: string;
    maxPx: number;
    quality: number;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchSettings().then(
      (response) => {
        if (!cancelled) setData(response);
      },
      (caught: unknown) => {
        if (!cancelled) {
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

  const live = edits?.token === reloadToken ? edits : null;
  const archiveRoot = live?.archiveRoot ?? data?.settings.archiveRoot ?? '';
  const maxPx = live?.maxPx ?? data?.settings.derivativeMaxPx ?? 1600;
  const quality = live?.quality ?? data?.settings.derivativeQuality ?? 82;

  const edit = useCallback(
    (patch: Partial<Omit<NonNullable<typeof edits>, 'token'>>) => {
      setEdits({token: reloadToken, archiveRoot, maxPx, quality, ...patch});
    },
    [reloadToken, archiveRoot, maxPx, quality],
  );

  const load = useCallback(() => setReloadToken((token) => token + 1), []);

  const persist = useCallback(
    async (overrides?: {archiveRoot?: string}) => {
      setIsSaving(true);
      try {
        const response = await saveSettings({
          archiveRoot: overrides?.archiveRoot ?? archiveRoot,
          derivativeMaxPx: maxPx,
          derivativeQuality: quality,
        });
        setData((current) => (current ? {...current, ...response} : current));
        setEdits(null);
        setReloadToken((token) => token + 1);
        toast({
          body: response.archive.isReady
            ? 'Saved. The archive folder is ready.'
            : (response.archive.problem ?? 'Saved, but the archive folder is not usable yet.'),
          type: response.archive.isReady ? 'info' : 'error',
        });
      } catch (caught) {
        toast({
          type: 'error',
          body: caught instanceof Error ? caught.message : String(caught),
        });
      } finally {
        setIsSaving(false);
      }
    },
    [archiveRoot, maxPx, quality, toast],
  );

  /**
   * Opens the real OS folder dialog. It is shown by the server process, because
   * the browser's own directory picker never reveals an absolute path and the
   * server is the side that writes the files.
   */
  const browse = useCallback(async () => {
    setIsBrowsing(true);
    try {
      const result = await browseForFolder(archiveRoot);
      if (result.unsupported) {
        toast({type: 'error', body: result.unsupported});
        return;
      }
      // A cancelled dialog is not a failure and does not deserve a toast.
      if (!result.path) return;
      edit({archiveRoot: result.path});
      await persist({archiveRoot: result.path});
    } catch (caught) {
      toast({
        type: 'error',
        body: caught instanceof Error ? caught.message : String(caught),
      });
    } finally {
      setIsBrowsing(false);
    }
  }, [archiveRoot, edit, persist, toast]);

  const create = useCallback(async () => {
    setIsCreating(true);
    try {
      const {archive} = await createArchiveFolder(archiveRoot);
      setData((current) => (current ? {...current, archive} : current));
      toast({
        body: archive.isReady
          ? `Created ${archive.archiveRoot}.`
          : (archive.problem ?? 'Could not create the folder.'),
        type: archive.isReady ? 'info' : 'error',
      });
    } catch (caught) {
      toast({
        type: 'error',
        body: caught instanceof Error ? caught.message : String(caught),
      });
    } finally {
      setIsCreating(false);
    }
  }, [archiveRoot, toast]);

  if (!data) {
    return (
      <Section padding={8}>
        <Stack direction="horizontal" gap={2} vAlign="center" hAlign="center">
          <Spinner size="md" label="Loading settings" />
          <Text color="secondary">Loading settings…</Text>
        </Stack>
      </Section>
    );
  }

  const {archive, supabase, appraisal} = data;
  const isDirty = live !== null;

  return (
    <Layout
      height="fill"
      contentWidth={720}
      header={
        <LayoutHeader hasDivider>
          <Stack direction="vertical" gap={1} padding={4}>
            <Heading level={1}>Settings</Heading>
            <Text color="secondary">
              Where originals are filed, and how big the copies that go to the
              cloud are.
            </Text>
          </Stack>
        </LayoutHeader>
      }
      content={
        <LayoutContent isScrollable padding={4}>
          <Stack direction="vertical" gap={6}>
            {archive.isReady ? (
              <Banner
                status="success"
                title="Archive folder ready"
                description={`${formatBytes(archive.freeBytes)} free of ${formatBytes(archive.totalBytes)} · ${archive.archivedCount ?? 0} lots filed`}
              />
            ) : archive.isMissing ? (
              <Banner
                status="warning"
                title="That folder does not exist yet"
                description={archive.problem ?? ''}
                endContent={
                  <Button
                    size="sm"
                    variant="primary"
                    label="Create it"
                    isLoading={isCreating}
                    onClick={() => void create()}
                  />
                }
              />
            ) : (
              <Banner
                status="error"
                title="Archive folder unusable"
                description={archive.problem ?? ''}
              />
            )}

            <Stack direction="vertical" gap={4}>
              <Heading level={2}>Archive folder</Heading>
              <Text color="secondary">
                Full-resolution originals are copied here, one folder per lot,
                and never modified or deleted afterwards. Photographs are dragged
                straight onto the Ingest screen from wherever they already live —
                nothing is ever read out of this folder, and nothing is ever
                removed from wherever you dragged them.
              </Text>

              <InputGroup label="Archive folder">
                <TextInput
                  label="Folder"
                  value={archiveRoot}
                  onChange={(value) => edit({archiveRoot: value})}
                  placeholder="C:\Users\you\Documents\Weldam House Archive"
                  width="100%"
                />
                <Button
                  variant="secondary"
                  label="Browse…"
                  isLoading={isBrowsing}
                  onClick={() => void browse()}
                  tooltip="Opens the Windows folder chooser on this machine"
                />
              </InputGroup>

              <Text type="supporting" color="secondary">
                Point this at an external drive whenever you get one. From that
                moment, an unplugged drive stops ingest with an error rather than
                quietly filing originals somewhere else — which is how half an
                archive ends up in two places.
              </Text>

              <Switch
                label="Keep originals"
                value
                isDisabled
                disabledMessage="Not negotiable. Originals under the archive folder are write-once."
                description="Always on. It exists as a setting so the write-once guarantee is stated rather than assumed."
                onChange={() => undefined}
              />
            </Stack>

            <Divider />

            <Stack direction="vertical" gap={4}>
              <Heading level={2}>Web copies</Heading>
              <Text color="secondary">
                Only these go to Supabase. A 1600px JPEG at quality 82 is roughly
                300 KB, so five hundred objects at three shots each sits under
                2 GB — a couple of euros a month. Camera originals never leave
                this machine.
              </Text>
              <Stack direction="horizontal" gap={4}>
                <NumberInput
                  label="Long edge"
                  units="px"
                  min={320}
                  max={4096}
                  step={80}
                  isIntegerOnly
                  value={maxPx}
                  onChange={(value) => edit({maxPx: value})}
                />
                <NumberInput
                  label="JPEG quality"
                  min={40}
                  max={100}
                  isIntegerOnly
                  value={quality}
                  onChange={(value) => edit({quality: value})}
                />
              </Stack>
            </Stack>

            <Stack direction="horizontal" gap={2}>
              <Button
                variant="primary"
                label={isDirty ? 'Save changes' : 'Saved'}
                isDisabled={!isDirty}
                isLoading={isSaving}
                onClick={() => void persist()}
              />
              <Button variant="ghost" label="Reload" onClick={load} />
            </Stack>

            <Divider />

            <Stack direction="vertical" gap={3}>
              <Heading level={2}>Connections</Heading>
              <Text color="secondary">
                Read from <Text as="span" type="code">.env.local</Text>. Not editable here on
                purpose — a settings screen that can write a service-role key is
                a settings screen that will eventually log one.
              </Text>
              <MetadataList columns="single">
                <MetadataListItem label="Supabase project">
                  {supabase.url ?? 'Not configured'}
                </MetadataListItem>
                <MetadataListItem label="Storage bucket">
                  {supabase.bucket ?? '—'}
                </MetadataListItem>
                <MetadataListItem label="Supabase key">
                  {supabase.keyKind === 'service_role'
                    ? 'service_role (bypasses RLS)'
                    : supabase.keyKind === 'publishable'
                      ? 'publishable — works because migration 0002 grants anon access'
                      : 'none'}
                </MetadataListItem>
                <MetadataListItem label="Appraisal model">
                  {appraisal.model}
                </MetadataListItem>
                <MetadataListItem label="Appraisal auth">
                  {appraisal.auth === 'claude_code_subscription'
                    ? 'Claude Code subscription (no per-image API billing)'
                    : 'ANTHROPIC_API_KEY (metered)'}
                </MetadataListItem>
              </MetadataList>
              <Stack direction="horizontal" gap={2} vAlign="center">
                <StatusDot
                  variant={supabase.configured ? 'success' : 'error'}
                  label={supabase.configured ? 'Supabase configured' : 'Supabase missing'}
                />
                <Text type="supporting" color="secondary">
                  {supabase.configured
                    ? 'Reads and writes go through server routes only; the key never reaches the browser.'
                    : 'Set SUPABASE_URL and a key in .env.local.'}
                </Text>
              </Stack>
            </Stack>

            <Divider />

            <Stack direction="vertical" gap={3} align="start">
              <Heading level={2}>Maintenance</Heading>
              <Text color="secondary">
                <Text as="span" type="code">item.md</Text> beside each set of originals is an
                export, regenerated from the database. Nothing reads one back
                in, so editing one changes nothing.
              </Text>
              <Button
                variant="secondary"
                label="Regenerate all sidecars"
                isDisabled={!archive.isReady}
                onClick={async () => {
                  try {
                    const report = await regenerateSidecars();
                    toast({
                      body: `Wrote ${report.written} sidecar${report.written === 1 ? '' : 's'}${
                        report.skipped.length
                          ? `, skipped ${report.skipped.length} with no archive folder`
                          : ''
                      }.`,
                    });
                  } catch (caught) {
                    toast({
                      type: 'error',
                      body: caught instanceof Error ? caught.message : String(caught),
                    });
                  }
                }}
              />
            </Stack>
          </Stack>
        </LayoutContent>
      }
    />
  );
}
