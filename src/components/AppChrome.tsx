'use client';

import type {ReactNode} from 'react';
import {usePathname} from 'next/navigation';
import {AppShell} from '@astryxdesign/core/AppShell';
import {Badge} from '@astryxdesign/core/Badge';
import {TopNav, TopNavHeading, TopNavItem} from '@astryxdesign/core/TopNav';
import {Icon} from '@astryxdesign/core/Icon';
import {IconButton} from '@astryxdesign/core/IconButton';

const NAV = [
  {href: '/', label: 'Inventory'},
  {href: '/ingest', label: 'Ingest'},
  {href: '/review', label: 'Review'},
] as const;

/**
 * The frame every screen sits in.
 *
 * TopNav rather than SideNav: three destinations that are not going to become
 * thirty, over screens that are already dense with their own controls. The
 * brand mark is the price tag — below the 44px the full lockup needs, the brand
 * rule is to use the tag alone, which is exactly the nav-bar case.
 */
export function AppChrome({children}: {children: ReactNode}) {
  const pathname = usePathname();

  return (
    <AppShell
      height="fill"
      contentPadding={0}
      // "elevated" floats a surface-white content area on the bone wash, which
      // is the brand's warm-paper-with-white-cards reading. "section" painted
      // the whole page surface-white and the bone never showed.
      variant="elevated"
      topNav={
        <TopNav
          label="Weldam House"
          heading={
            <TopNavHeading
              logo={<Badge variant="tag-logo" label="W" />}
              heading="Weldam House"
              headingHref="/"
              subheading="Inventory"
            />
          }
          startContent={NAV.map((entry) => (
            <TopNavItem
              key={entry.href}
              href={entry.href}
              label={entry.label}
              isSelected={
                entry.href === '/'
                  ? pathname === '/'
                  : pathname.startsWith(entry.href)
              }
            />
          ))}
          endContent={
            <IconButton
              // IconButton takes a node, not a semantic name — passing the
              // string renders the word "wrench".
              icon={<Icon icon="wrench" />}
              label="Settings"
              variant="ghost"
              href="/settings"
              tooltip="Settings"
            />
          }
        />
      }
    >
      {children}
    </AppShell>
  );
}
