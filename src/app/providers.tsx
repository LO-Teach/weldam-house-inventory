'use client';

import type {ReactNode} from 'react';
import Link from 'next/link';
import {Theme} from '@astryxdesign/core/theme';
import {LinkProvider} from '@astryxdesign/core/Link';
import {ToastViewport} from '@astryxdesign/core/Toast';
import {weldamTheme} from '../theme/built/weldam';

/**
 * Locked to light. Weldam House is a warm-cream identity — bone paper, ink
 * type, one tomato accent. The theme does define a full dark ramp (ochre takes
 * over as the accent there, per the brand rule that ochre is a dark-surface
 * colour only), so flipping this to "system" is a one-word change if the shop
 * ever wants it.
 */
export function Providers({children}: {children: ReactNode}) {
  return (
    <Theme theme={weldamTheme} mode="light">
      <LinkProvider component={Link}>
        <ToastViewport position="bottomEnd" maxVisible={3}>
          {children}
        </ToastViewport>
      </LinkProvider>
    </Theme>
  );
}
