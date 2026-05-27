'use client';

import { useEffect } from 'react';

// On mount, move every `[data-relocate-response-tabs]` element into the
// page's `[data-response-tabs-anchor]` element and unhide it. Lets us
// keep the example response payloads close to their source (the
// apiExample slot) in the React tree, while showing them as the last
// element on the page in the DOM — the layout fumadocs ships rendered
// them next to the cURL/SDK code samples, which is fine when readers
// want them as a quick reference, but visually competes with the static
// schema. Moving them past the Response schema reads better.
//
// The hop is one-shot per page render — React will replant the original
// hidden node on navigation, so we just re-run on each anchor mount.
export function ResponseTabsRelocator() {
  useEffect(() => {
    const anchor = document.querySelector('[data-response-tabs-anchor]');
    if (!anchor) return;
    document
      .querySelectorAll<HTMLElement>('[data-relocate-response-tabs]')
      .forEach((src) => {
        // Move children (preserve React-managed parent) into the anchor.
        while (src.firstChild) anchor.appendChild(src.firstChild);
        src.hidden = true;
      });
  }, []);

  return null;
}
