'use client';

import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
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
  LayoutPanel,
} from '@astryxdesign/core/Layout';
import {Pagination} from '@astryxdesign/core/Pagination';
import {Section} from '@astryxdesign/core/Section';
import {Selector} from '@astryxdesign/core/Selector';
import {Spinner} from '@astryxdesign/core/Spinner';
import {Stack} from '@astryxdesign/core/Stack';
import {
  Table,
  pixel,
  proportional,
  useTableSelection,
  useTableSelectionState,
  type TableColumn,
} from '@astryxdesign/core/Table';
import {Text} from '@astryxdesign/core/Text';
import {TextInput} from '@astryxdesign/core/TextInput';
import {Toolbar} from '@astryxdesign/core/Toolbar';
import {Tooltip} from '@astryxdesign/core/Tooltip';
import {useToast} from '@astryxdesign/core/Toast';

import {
  bulkPatch,
  fetchItems,
  fetchMeta,
  patchItem,
  regenerateSidecars,
  type ItemsResponse,
} from '@/src/lib/client';
import {
  STATUS_LABELS,
  type Channel,
  type Confidence,
  type ItemWithImages,
  type Status,
} from '@/src/lib/types';
import {
  CHANNEL_OPTIONS,
  CONFIDENCE_OPTIONS,
  ConfidenceBadge,
  STATUS_OPTIONS,
  StatusBadge,
  formatEuro,
  lotLabel,
} from './common';
import {InlineNumber, InlineText} from './InlineEdit';
import {ListingDrawer} from './ListingDrawer';

const PAGE_SIZE = 100;
const ANY = '__any__';

interface Filters {
  q: string;
  status: string;
  channel: string;
  category: string;
  confidence: string;
  hasMaker: string;
  priceMin: string;
  priceMax: string;
  preset: string;
}

const EMPTY_FILTERS: Filters = {
  q: '',
  status: ANY,
  channel: ANY,
  category: ANY,
  confidence: ANY,
  hasMaker: ANY,
  priceMin: '',
  priceMax: '',
  preset: '',
};

export function InventoryScreen() {
  const toast = useToast();

  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  /**
   * The loaded query travels with its result. "Is this stale?" is then a
   * comparison during render rather than a second piece of state an effect has
   * to keep in step — which is what turns a data fetch into cascading renders.
   */
  const [loaded, setLoaded] = useState<{
    key: string;
    data: ItemsResponse | null;
    error: string | null;
  } | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [drawerItem, setDrawerItem] = useState<ItemWithImages | null>(null);
  const [meta, setMeta] = useState<{categories: string[]; lotGroups: string[]}>({
    categories: [],
    lotGroups: [],
  });

  // Typing in the search box should not fire a request per keystroke.
  const [debouncedQuery, setDebouncedQuery] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(filters.q), 250);
    return () => clearTimeout(timer);
  }, [filters.q]);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (debouncedQuery.trim()) params.set('q', debouncedQuery.trim());
    if (filters.status !== ANY) params.set('status', filters.status);
    if (filters.channel !== ANY) params.set('channel', filters.channel);
    if (filters.category !== ANY) params.set('category', filters.category);
    if (filters.confidence !== ANY) params.set('confidence', filters.confidence);
    if (filters.hasMaker !== ANY) params.set('hasMaker', filters.hasMaker);
    if (filters.priceMin.trim()) params.set('priceMin', filters.priceMin.trim());
    if (filters.priceMax.trim()) params.set('priceMax', filters.priceMax.trim());
    if (filters.preset) params.set('preset', filters.preset);
    params.set('limit', String(PAGE_SIZE));
    params.set('offset', String((page - 1) * PAGE_SIZE));
    return params;
  }, [debouncedQuery, filters, page]);

  const requestKey = `${queryString.toString()}#${reloadToken}`;

  useEffect(() => {
    let cancelled = false;
    fetchItems(queryString).then(
      (next) => {
        if (!cancelled) setLoaded({key: requestKey, data: next, error: null});
      },
      (caught: unknown) => {
        if (!cancelled) {
          setLoaded({
            key: requestKey,
            data: null,
            error: caught instanceof Error ? caught.message : String(caught),
          });
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [queryString, requestKey]);

  /** Ask the server for fresh rows without changing the filters. */
  const load = useCallback(() => setReloadToken((token) => token + 1), []);

  /** Swap one row in place, for optimistic edits and drawer round-trips. */
  const replaceRow = useCallback((row: ItemWithImages) => {
    setLoaded((current) =>
      current?.data
        ? {
            ...current,
            data: {
              ...current.data,
              items: current.data.items.map((existing) =>
                existing.id === row.id ? row : existing,
              ),
            },
          }
        : current,
    );
  }, []);

  /** Merge a partial patch into one row, before the server has confirmed it. */
  const mergeRow = useCallback((id: string, patch: Record<string, unknown>) => {
    setLoaded((current) =>
      current?.data
        ? {
            ...current,
            data: {
              ...current.data,
              items: current.data.items.map((existing) =>
                existing.id === id ? {...existing, ...patch} : existing,
              ),
            },
          }
        : current,
    );
  }, []);

  const data = loaded?.data ?? null;
  const error = loaded?.error ?? null;
  const isLoading = loaded?.key !== requestKey;

  useEffect(() => {
    let cancelled = false;
    fetchMeta().then(
      (next) => {
        if (!cancelled) setMeta(next);
      },
      () => undefined,
    );
    return () => {
      cancelled = true;
    };
  }, [requestKey]);

  // A filter change invalidates the page number; staying on page 4 of a
  // one-page result is a blank screen with no explanation.
  const filterSignature = JSON.stringify({...filters, q: debouncedQuery});
  const lastSignature = useRef(filterSignature);
  useEffect(() => {
    if (lastSignature.current !== filterSignature) {
      lastSignature.current = filterSignature;
      setPage(1);
      setSelectedKeys(new Set());
    }
  }, [filterSignature]);

  const items = data?.items ?? [];

  /** Optimistic single-field edit: the row updates, then the server confirms. */
  const updateItem = useCallback(
    async (id: string, patch: Record<string, unknown>) => {
      mergeRow(id, patch);
      try {
        const {item} = await patchItem(id, patch);
        replaceRow(item);
        setDrawerItem((current) => (current?.id === id ? item : current));
      } catch (caught) {
        toast({
          type: 'error',
          body: caught instanceof Error ? caught.message : String(caught),
        });
        // The optimistic row is now a lie; re-read rather than guess.
        load();
      }
    },
    [load, mergeRow, replaceRow, toast],
  );

  const runBulk = useCallback(
    async (patch: Record<string, unknown>, description: string) => {
      const ids = [...selectedKeys];
      if (ids.length === 0) return;
      try {
        const {updated} = await bulkPatch(ids, patch);
        toast({body: `${description} — ${updated} item${updated === 1 ? '' : 's'}.`});
        setSelectedKeys(new Set());
        load();
      } catch (caught) {
        toast({
          type: 'error',
          body: caught instanceof Error ? caught.message : String(caught),
        });
      }
    },
    [selectedKeys, load, toast],
  );

  const {selectionConfig} = useTableSelectionState<ItemRow>({
    data: items as unknown as ItemRow[],
    idKey: 'id',
    selectedKeys,
    setSelectedKeys,
  });
  const selectionPlugin = useTableSelection<ItemRow>(selectionConfig);

  const columns = useMemo(
    () => buildColumns({updateItem, onOpenDrawer: setDrawerItem, lotGroups: meta.lotGroups}),
    [updateItem, meta.lotGroups],
  );

  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / PAGE_SIZE));
  const selectedCount = selectedKeys.size;
  const isSleepers = filters.preset === 'sleepers';

  return (
    <Layout
      height="fill"
      header={
        <LayoutHeader hasDivider>
          <Stack direction="vertical" gap={3} padding={4}>
            <Stack direction="horizontal" hAlign="between" vAlign="center" gap={3} wrap="wrap">
              <Stack direction="horizontal" gap={3} vAlign="center">
                <Heading level={1}>Inventory</Heading>
                <Text color="secondary">
                  {data ? `${data.total} item${data.total === 1 ? '' : 's'}` : 'Loading…'}
                </Text>
              </Stack>
              <Stack direction="horizontal" gap={2}>
                <Tooltip content="Rewrite item.md beside every archived original, from the database.">
                  <Button
                    variant="ghost"
                    size="sm"
                    label="Regenerate sidecars"
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
                </Tooltip>
                <Button
                  variant="secondary"
                  size="sm"
                  label="Export CSV"
                  href={`/api/export?${queryString.toString()}`}
                />
              </Stack>
            </Stack>

            <Toolbar
              label="Filters"
              size="sm"
              startContent={
                <>
                  <TextInput
                    label="Search"
                    isLabelHidden
                    size="sm"
                    startIcon="search"
                    placeholder="Title, maker, marks, notes…"
                    hasClear
                    width={240}
                    value={filters.q}
                    onChange={(value) => setFilters((f) => ({...f, q: value}))}
                  />
                  <Selector
                    label="Status"
                    isLabelHidden
                    size="sm"
                    variant="ghost"
                    value={filters.status}
                    onChange={(value) => setFilters((f) => ({...f, status: String(value)}))}
                    options={[{value: ANY, label: 'Any status'}, ...STATUS_OPTIONS]}
                  />
                  <Selector
                    label="Channel"
                    isLabelHidden
                    size="sm"
                    variant="ghost"
                    value={filters.channel}
                    onChange={(value) => setFilters((f) => ({...f, channel: String(value)}))}
                    options={[{value: ANY, label: 'Any channel'}, ...CHANNEL_OPTIONS]}
                  />
                  <Selector
                    label="Category"
                    isLabelHidden
                    size="sm"
                    variant="ghost"
                    hasSearch
                    value={filters.category}
                    onChange={(value) => setFilters((f) => ({...f, category: String(value)}))}
                    options={[
                      {value: ANY, label: 'Any category'},
                      ...meta.categories.map((value) => ({value, label: value})),
                    ]}
                  />
                  <Selector
                    label="Confidence"
                    isLabelHidden
                    size="sm"
                    variant="ghost"
                    value={filters.confidence}
                    onChange={(value) =>
                      setFilters((f) => ({...f, confidence: String(value)}))
                    }
                    options={[
                      {value: ANY, label: 'Any confidence'},
                      ...CONFIDENCE_OPTIONS,
                    ]}
                  />
                  <Selector
                    label="Maker"
                    isLabelHidden
                    size="sm"
                    variant="ghost"
                    value={filters.hasMaker}
                    onChange={(value) => setFilters((f) => ({...f, hasMaker: String(value)}))}
                    options={[
                      {value: ANY, label: 'Any maker'},
                      {value: 'yes', label: 'Has a maker'},
                      {value: 'no', label: 'No maker'},
                    ]}
                  />
                  <TextInput
                    label="Minimum price"
                    isLabelHidden
                    size="sm"
                    placeholder="€ min"
                    width={80}
                    value={filters.priceMin}
                    onChange={(value) => setFilters((f) => ({...f, priceMin: value}))}
                  />
                  <TextInput
                    label="Maximum price"
                    isLabelHidden
                    size="sm"
                    placeholder="€ max"
                    width={80}
                    value={filters.priceMax}
                    onChange={(value) => setFilters((f) => ({...f, priceMax: value}))}
                  />
                </>
              }
              endContent={
                <>
                  <Tooltip content="Appraised, not certain, and something worth checking on the base. Two seconds with a torch could move the price bracket.">
                    <Button
                      size="sm"
                      variant={isSleepers ? 'primary' : 'ghost'}
                      label="Sleepers"
                      onClick={() =>
                        setFilters((f) => ({
                          ...f,
                          preset: f.preset === 'sleepers' ? '' : 'sleepers',
                        }))
                      }
                    />
                  </Tooltip>
                  <Button
                    size="sm"
                    variant="ghost"
                    label="Clear"
                    onClick={() => setFilters(EMPTY_FILTERS)}
                  />
                </>
              }
            />

            {selectedCount > 0 ? (
              <Toolbar
                label="Bulk actions"
                size="sm"
                variant="muted"
                startContent={
                  <Text weight="semibold">
                    {selectedCount} selected
                  </Text>
                }
                endContent={
                  <>
                    <Selector
                      label="Set channel"
                      isLabelHidden
                      size="sm"
                      placeholder="Set channel…"
                      value=""
                      onChange={(value) => {
                        if (value) void runBulk({channel: value}, 'Channel set');
                      }}
                      options={CHANNEL_OPTIONS}
                    />
                    <AssignLotGroup
                      lotGroups={meta.lotGroups}
                      onAssign={(group) =>
                        runBulk({lot_group: group, channel: 'lot'}, `Assigned to ${group}`)
                      }
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      label="Mark listed"
                      onClick={() => void runBulk({status: 'listed'}, 'Marked listed')}
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      label="Mark sold"
                      onClick={() => void runBulk({status: 'sold'}, 'Marked sold')}
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      label="Deselect"
                      onClick={() => setSelectedKeys(new Set())}
                    />
                  </>
                }
              />
            ) : null}
          </Stack>
        </LayoutHeader>
      }
      content={
        <LayoutContent isScrollable>
          {error ? (
            <Section padding={4}>
              <Banner
                status="error"
                title="Could not load the inventory"
                description={error}
                endContent={<Button size="sm" variant="secondary" label="Retry" onClick={load} />}
              />
            </Section>
          ) : isLoading && !data ? (
            <Section padding={8}>
              <Stack direction="horizontal" gap={2} vAlign="center" hAlign="center">
                <Spinner size="md" label="Loading inventory" />
                <Text color="secondary">Loading inventory…</Text>
              </Stack>
            </Section>
          ) : items.length === 0 ? (
            <Section padding={8}>
              <EmptyState
                title={
                  isSleepers
                    ? 'No sleepers right now'
                    : hasAnyFilter(filters)
                      ? 'Nothing matches those filters'
                      : 'The inventory is empty'
                }
                description={
                  isSleepers
                    ? 'Every appraised item is either certain or has nothing left to check.'
                    : hasAnyFilter(filters)
                      ? 'Loosen a filter, or clear them all.'
                      : 'Drop a group of photographs on the Ingest screen to create the first lot.'
                }
                actions={
                  hasAnyFilter(filters) ? (
                    <Button
                      variant="secondary"
                      label="Clear filters"
                      onClick={() => setFilters(EMPTY_FILTERS)}
                    />
                  ) : (
                    <Button variant="primary" label="Go to Ingest" href="/ingest" />
                  )
                }
              />
            </Section>
          ) : (
            <Table
              data={items as unknown as ItemRow[]}
              columns={columns}
              idKey="id"
              density="compact"
              hasHover
              dividers="rows"
              textOverflow="truncate"
              verticalAlign="middle"
              plugins={{selection: selectionPlugin}}
              rowIndexStart={(page - 1) * PAGE_SIZE + 1}
              rowCount={data?.total}
            />
          )}
        </LayoutContent>
      }
      footer={
        // LayoutFooter sizes itself for a single bar of controls; the summary
        // is two lines per figure, so it needs the height stated.
        <LayoutFooter hasDivider height={84} padding={3}>
          <Stack
            direction="horizontal"
            hAlign="between"
            vAlign="center"
            gap={4}
            wrap="wrap"
          >
            <Stack direction="horizontal" gap={4} vAlign="center" wrap="wrap">
              <SummaryFigure label="Items" value={String(data?.summary.count ?? 0)} />
              <Divider orientation="vertical" />
              <SummaryFigure
                label="Total local"
                value={formatEuro(data?.summary.totalLocal ?? 0)}
              />
              <SummaryFigure
                label="Total intl"
                value={formatEuro(data?.summary.totalIntl ?? 0)}
              />
              <Divider orientation="vertical" />
              <Stack direction="horizontal" gap={2} vAlign="center" wrap="wrap">
                {(Object.keys(STATUS_LABELS) as Status[])
                  .filter((status) => (data?.summary.byStatus[status] ?? 0) > 0)
                  .map((status) => (
                    <Stack key={status} direction="horizontal" gap={1} vAlign="center">
                      <StatusBadge status={status} />
                      <Text hasTabularNumbers weight="medium">
                        {data?.summary.byStatus[status] ?? 0}
                      </Text>
                    </Stack>
                  ))}
              </Stack>
            </Stack>

            {totalPages > 1 ? (
              <Pagination
                label="Inventory pages"
                variant="pages"
                size="sm"
                page={page}
                totalPages={totalPages}
                totalItems={data?.total}
                pageSize={PAGE_SIZE}
                onChange={setPage}
              />
            ) : null}
          </Stack>
        </LayoutFooter>
      }
      end={
        drawerItem ? (
          <LayoutPanel width={440} hasDivider isScrollable label="Listing">
            <ListingDrawer
              item={drawerItem}
              onClose={() => setDrawerItem(null)}
              onItemChange={(item) => {
                setDrawerItem(item);
                replaceRow(item);
              }}
            />
          </LayoutPanel>
        ) : undefined
      }
    />
  );
}

function SummaryFigure({label, value}: {label: string; value: string}) {
  return (
    <Stack direction="vertical" gap={0}>
      <Text type="supporting" color="secondary">
        {label}
      </Text>
      <Text weight="semibold" hasTabularNumbers>
        {value}
      </Text>
    </Stack>
  );
}

function AssignLotGroup({
  lotGroups,
  onAssign,
}: {
  lotGroups: string[];
  onAssign: (group: string) => void | Promise<void>;
}) {
  const [value, setValue] = useState('');
  return (
    <Stack direction="horizontal" gap={1} vAlign="center">
      <TextInput
        label="Lot group"
        isLabelHidden
        size="sm"
        width={150}
        placeholder="Lot group…"
        value={value}
        onChange={setValue}
        onEnter={() => {
          if (value.trim()) {
            void onAssign(value.trim());
            setValue('');
          }
        }}
      />
      {lotGroups.length > 0 ? (
        <Selector
          label="Existing lot groups"
          isLabelHidden
          size="sm"
          variant="ghost"
          placeholder="existing…"
          value=""
          onChange={(next) => {
            if (next) void onAssign(String(next));
          }}
          options={lotGroups.map((group) => ({value: group, label: group}))}
        />
      ) : null}
    </Stack>
  );
}

function hasAnyFilter(filters: Filters): boolean {
  return JSON.stringify(filters) !== JSON.stringify(EMPTY_FILTERS);
}

// --- columns ----------------------------------------------------------------

/**
 * Astryx's Table needs its row type to be an index signature. The app's real
 * type is ItemWithImages; this alias is the structural bridge and nothing else.
 */
type ItemRow = ItemWithImages & Record<string, unknown>;

function buildColumns({
  updateItem,
  onOpenDrawer,
  lotGroups,
}: {
  updateItem: (id: string, patch: Record<string, unknown>) => Promise<void>;
  onOpenDrawer: (item: ItemWithImages) => void;
  lotGroups: string[];
}): TableColumn<ItemRow>[] {
  return [
    {
      key: 'thumb',
      header: '',
      width: pixel(52),
      renderCell: (row) => <RowThumb item={row} />,
    },
    {
      key: 'lot_number',
      header: 'Lot',
      width: pixel(64),
      renderCell: (row) => (
        <Text hasTabularNumbers weight="medium">
          {lotLabel(row.lot_number)}
        </Text>
      ),
    },
    {
      key: 'title_nl',
      header: 'Title (NL)',
      width: proportional(3),
      renderCell: (row) => (
        <button
          type="button"
          onClick={() => onOpenDrawer(row)}
          className="w-full cursor-pointer border-0 bg-transparent p-0 text-left underline-offset-2 hover:underline"
        >
          <Text maxLines={1} color={row.title_nl ? 'primary' : 'secondary'}>
            {row.title_nl || 'Not appraised yet'}
          </Text>
        </button>
      ),
    },
    {
      key: 'category',
      header: 'Category',
      width: proportional(1),
      renderCell: (row) => (
        <Text color={row.category ? 'primary' : 'secondary'} maxLines={1}>
          {row.category || '—'}
        </Text>
      ),
    },
    {
      key: 'maker',
      header: 'Maker',
      width: proportional(1),
      renderCell: (row) => (
        <Text color={row.maker ? 'primary' : 'secondary'} maxLines={1}>
          {row.maker || '—'}
        </Text>
      ),
    },
    {
      key: 'price_local',
      header: 'Local',
      width: pixel(96),
      align: 'end',
      renderCell: (row) => (
        <InlineNumber
          label={`Local price for lot ${lotLabel(row.lot_number)}`}
          value={row.price_local}
          onCommit={(value) => updateItem(row.id, {price_local: value})}
        />
      ),
    },
    {
      key: 'price_intl',
      header: 'Intl',
      width: pixel(96),
      align: 'end',
      renderCell: (row) => (
        <InlineNumber
          label={`International price for lot ${lotLabel(row.lot_number)}`}
          value={row.price_intl}
          onCommit={(value) => updateItem(row.id, {price_intl: value})}
        />
      ),
    },
    {
      key: 'channel',
      header: 'Channel',
      width: pixel(124),
      renderCell: (row) => (
        <Selector
          label={`Channel for lot ${lotLabel(row.lot_number)}`}
          isLabelHidden
          size="sm"
          variant="ghost"
          value={row.channel ?? ''}
          onChange={(value) => void updateItem(row.id, {channel: value as Channel})}
          options={CHANNEL_OPTIONS}
        />
      ),
    },
    {
      key: 'confidence',
      header: 'Confidence',
      width: pixel(108),
      renderCell: (row) => (
        <ConfidenceBadge
          confidence={row.confidence as Confidence | null}
          reasoning={row.facts?.reasoning ?? null}
        />
      ),
    },
    {
      key: 'lot_group',
      header: 'Lot group',
      width: proportional(1),
      renderCell: (row) => (
        <InlineText
          label={`Lot group for lot ${lotLabel(row.lot_number)}`}
          value={row.lot_group}
          placeholder={lotGroups.length > 0 ? '—' : '—'}
          onCommit={(value) => updateItem(row.id, {lot_group: value})}
        />
      ),
    },
    {
      key: 'status',
      header: 'Status',
      width: pixel(152),
      renderCell: (row) => (
        <Selector
          label={`Status for lot ${lotLabel(row.lot_number)}`}
          isLabelHidden
          size="sm"
          variant="ghost"
          value={row.status}
          onChange={(value) => void updateItem(row.id, {status: value as Status})}
          options={STATUS_OPTIONS}
          renderValue={() => <StatusBadge status={row.status} />}
        />
      ),
    },
    {
      key: 'marks_to_check',
      header: '',
      width: pixel(36),
      renderCell: (row) =>
        row.marks_to_check ? (
          <Tooltip content={row.marks_to_check}>
            <Badge variant="orange" label="!" />
          </Tooltip>
        ) : null,
    },
  ];
}

function RowThumb({item}: {item: ItemWithImages}) {
  const primary = item.images.find((image) => image.is_primary) ?? item.images[0];
  if (!primary?.url) {
    return (
      <span
        aria-hidden
        className="block size-9 rounded-sm border border-border bg-body"
      />
    );
  }
  return (
    /* Signed Supabase URLs expire hourly and carry a one-time token, so they
       are not a remote pattern next/image can be configured for. These are
       already 1600px derivatives rendered at 36px. */
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={primary.url}
      alt={`Lot ${lotLabel(item.lot_number)}`}
      width={36}
      height={36}
      loading="lazy"
      className="size-9 rounded-sm border border-border object-cover"
    />
  );
}
