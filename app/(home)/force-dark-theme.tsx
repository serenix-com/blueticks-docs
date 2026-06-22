'use client';

import { useEffect } from 'react';
import { useTheme } from 'next-themes';

/**
 * Forces real dark mode for the home route only.
 *
 * The home page is designed dark-only, and the Fumadocs nav uses a translucent
 * `backdrop-blur` bar — so it samples whatever the page body actually is. A
 * `.dark`-scoped CSS override isn't enough: if the global theme is light, the
 * body behind the blurred nav stays light and the bar renders grey. So we flip
 * the genuine `next-themes` class on <html> while this component is mounted, and
 * restore the user's real preference on unmount. We touch the DOM directly (not
 * `setTheme`) so nothing is persisted — the /docs pages keep their own theme.
 *
 * A hard load is handled by the inline pre-paint script in layout.tsx (no
 * flash); this effect covers client-side navigation into/out of the home route.
 */
export function ForceDarkTheme() {
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    const el = document.documentElement;
    const force = () => {
      el.classList.add('dark');
      el.classList.remove('light');
      el.style.colorScheme = 'dark';
    };
    force();

    // next-themes re-applies the class on its own effects (notably when the OS
    // theme changes and the user's preference is "system"). Re-assert dark so
    // the home page can't be flipped back to light underneath us.
    const observer = new MutationObserver(() => {
      if (!el.classList.contains('dark')) force();
    });
    observer.observe(el, { attributes: true, attributeFilter: ['class'] });

    return () => {
      observer.disconnect();
      // Restore the user's actual theme when leaving the home route.
      const real = resolvedTheme === 'light' ? 'light' : 'dark';
      el.classList.remove('light', 'dark');
      el.classList.add(real);
      el.style.colorScheme = real;
    };
  }, [resolvedTheme]);

  return null;
}
