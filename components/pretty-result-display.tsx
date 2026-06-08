'use client';

import { useMemo } from 'react';
import {
  DefaultResultDisplay,
  type ResultDisplayProps,
} from 'fumadocs-openapi/playground/client';

// Playground response viewer. fumadocs renders the response body verbatim
// through a shiki code block, so a minified JSON payload (which our API
// returns) shows as one long horizontally-scrolling line in a cramped box.
//
// We pretty-print JSON responses before handing them to the default display,
// so the body renders across multiple indented lines. The `data-bt-result`
// marker lets global.css cap the height at 500px with a vertical scrollbar
// (see app/global.css). Non-JSON / unparseable bodies pass through untouched.
export function PrettyResultDisplay({ data, ...rest }: ResultDisplayProps) {
  const pretty = useMemo(() => prettyPrintJsonBody(data), [data]);
  return <DefaultResultDisplay data={pretty} {...rest} data-bt-result="" />;
}

function prettyPrintJsonBody(
  data: ResultDisplayProps['data'],
): ResultDisplayProps['data'] {
  if (data.type !== 'response' || data.body.byteLength === 0) return data;

  const contentType = data.headers.get('content-type') ?? '';
  if (!contentType.includes('json')) return data;

  try {
    const text = new TextDecoder('utf-8').decode(data.body);
    const pretty = JSON.stringify(JSON.parse(text), null, 2);
    if (pretty === text) return data; // already formatted
    return { ...data, body: new TextEncoder().encode(pretty).buffer as ArrayBuffer };
  } catch {
    return data; // not valid JSON — leave the raw body alone
  }
}
