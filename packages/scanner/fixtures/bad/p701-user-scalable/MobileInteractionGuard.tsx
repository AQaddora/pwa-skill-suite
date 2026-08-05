'use client';

import { useEffect } from 'react';

export function MobileInteractionGuard() {
  useEffect(() => {
    const preventGesture: EventListener = (event) => event.preventDefault();
    const preventMultiTouch: EventListener = (event) => {
      if ((event as TouchEvent).touches?.length > 1) event.preventDefault();
    };
    const options: AddEventListenerOptions = { passive: false };

    document.addEventListener('gesturestart', preventGesture, options);
    window.addEventListener('gesturechange', preventGesture, options);
    document.addEventListener('touchmove', preventMultiTouch, options);
  }, []);

  return null;
}
