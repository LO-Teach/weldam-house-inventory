import type {NextConfig} from 'next';

const nextConfig: NextConfig = {
  // Both bottom corners carry controls — inventory totals and pagination on one
  // side, Confirm and Re-appraise on the other — and the floating dev badge sits
  // on top of whichever corner it is parked in. Compile and runtime errors still
  // surface in the full-screen overlay with this off.
  devIndicators: false,
};

export default nextConfig;
