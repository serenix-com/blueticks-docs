'use client';

import { useEffect } from 'react';

// Expand every collapsed Radix Accordion / Collapsible trigger inside the
// containers that mount this component. fumadocs-openapi renders nested
// schema fields and response-status panels collapsed by default; the
// reference reads better with everything open, especially for the
// request-body fields a caller needs to wire up.
//
// We click triggers (rather than overriding CSS) so Radix's state stays
// authoritative — the user can still collapse what they don't want to see.
// Each trigger is marked after its one auto-click so the MutationObserver
// (watching for lazily-mounted accordions) never re-expands what the user
// just collapsed, and never enters a click→DOM-mutation→re-click loop.
export function ApiAutoExpand({ selector }: { selector: string }) {
  useEffect(() => {
    const MARK = 'data-auto-expanded';

    const expand = () => {
      document.querySelectorAll(selector).forEach((root) => {
        root
          .querySelectorAll<HTMLButtonElement>(
            `button[aria-expanded="false"]:not([${MARK}])`,
          )
          .forEach((btn) => {
            btn.setAttribute(MARK, 'true');
            btn.click();
          });
      });
    };

    expand();

    const observer = new MutationObserver(() => expand());
    observer.observe(document.body, { childList: true, subtree: true });

    return () => observer.disconnect();
  }, [selector]);

  return null;
}
