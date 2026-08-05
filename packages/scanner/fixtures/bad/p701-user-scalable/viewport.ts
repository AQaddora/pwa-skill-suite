import type { Viewport } from 'next';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export function generateViewport(): Viewport {
  return { width: 'device-width', maximumScale: 0.8 };
}
