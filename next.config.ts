import type {NextConfig} from 'next';

const nextConfig: NextConfig = {
  devIndicators: {
    // Every screen puts something at the bottom-left of its footer — the
    // inventory totals, Review's Previous button — and the default position
    // sits on top of them.
    position: 'bottom-right',
  },
};

export default nextConfig;
