'use client';

import { useEffect } from 'react';

// Tidy up the playground's Authorization panel (fumadocs-openapi renders it
// from the OpenAPI security schemes, with no per-field customization hooks
// reachable from this RSC setup):
//
//   1. Replace the generic "Enter value" placeholder on the API-key input
//      with a domain-specific prompt.
//   2. Hide the auth-scheme <Select>. The API exposes a single scheme
//      (BearerAuth), so the dropdown is a redundant one-option control — the
//      panel title and the key input already say everything the caller needs.
//   3. Auto-prepend "Bearer " to the key. For an http/bearer scheme fumadocs
//      treats the field as the *entire* Authorization header value (sent
//      verbatim, no transform), so a pasted key alone yields
//      `Authorization: <key>` → 401. We normalize a bare key to
//      `Bearer <key>` on paste/blur, matching the Postman "Bearer Token" UX
//      where the caller supplies only the token.
//
// The panel mounts (and re-renders) on the client after hydration, so we run
// on mount and again on any DOM mutation, marking nodes so each is handled
// once. The entered key itself persists across pages — fumadocs stores it in
// localStorage under a scheme-scoped key, independent of the current page.
export function AuthFieldCustomizer({ placeholder }: { placeholder: string }) {
  useEffect(() => {
    const MARK = 'data-auth-customized';

    const apply = () => {
      document
        .querySelectorAll<HTMLElement>('[data-type="authorization"]')
        .forEach((panel) => {
          panel
            .querySelectorAll<HTMLInputElement>(`input:not([${MARK}])`)
            .forEach((input) => {
              input.setAttribute(MARK, 'true');
              input.placeholder = placeholder;
              wireBearerPrefix(input);
            });

          // The scheme picker is the only Radix Select (role="combobox")
          // inside the panel; hide its trigger rather than unmount it so the
          // preselected scheme stays authoritative.
          panel
            .querySelectorAll<HTMLElement>(
              `button[role="combobox"]:not([${MARK}])`,
            )
            .forEach((trigger) => {
              trigger.setAttribute(MARK, 'true');
              trigger.style.display = 'none';
            });
        });
    };

    apply();

    const observer = new MutationObserver(() => apply());
    observer.observe(document.body, { childList: true, subtree: true });

    return () => observer.disconnect();
  }, [placeholder]);

  return null;
}

// Ensure the field's value carries the "Bearer " prefix the API requires.
// Triggers on paste (the common flow for an API key) and on blur (typed
// input). Idempotent: a value already starting with "Bearer" is left alone,
// so users who paste a full "Bearer <token>" — or rely on fumadocs's default
// "Bearer " prefill — never get a doubled prefix.
function wireBearerPrefix(input: HTMLInputElement): void {
  const normalize = () => {
    const value = input.value.trim();
    if (!value || /^bearer/i.test(value)) return;
    setReactInputValue(input, `Bearer ${value}`);
  };

  input.addEventListener('input', (e) => {
    // Only react to a paste, not to per-keystroke typing (which would turn
    // the first character into "Bearer x"). Our own synthetic input event
    // below has no inputType, so this guard also prevents re-entry.
    if ((e as InputEvent).inputType === 'insertFromPaste') normalize();
  });
  input.addEventListener('blur', normalize);
}

// Set a controlled React input's value and notify React so its onChange runs
// (which updates fumadocs's field engine + localStorage). The native value
// setter bypasses React's value tracker; dispatching `input` re-syncs it.
function setReactInputValue(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    'value',
  )?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}
