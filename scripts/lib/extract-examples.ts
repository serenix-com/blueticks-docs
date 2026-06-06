import { fromMarkdown } from 'mdast-util-from-markdown';
import { mdxjs } from 'micromark-extension-mdxjs';
import { mdxFromMarkdown } from 'mdast-util-mdx';
import { visit } from 'unist-util-visit';
import type { CodeBlock, ExampleGroup, Lang } from './types';
import { parseIgnoreMarker } from './suppress';

const LANG_MAP: Record<string, Lang> = {
  python: 'python', py: 'python',
  ts: 'ts', tsx: 'ts', typescript: 'ts',
  js: 'js', jsx: 'js', javascript: 'js',
  bash: 'bash', sh: 'bash', shell: 'bash',
  json: 'json',
};

function normalizeLang(lang: string | null | undefined): Lang | null {
  if (!lang) return null;
  return LANG_MAP[lang.toLowerCase()] ?? null;
}

function parseMdx(src: string): any {
  return fromMarkdown(src, {
    extensions: [mdxjs()],
    mdastExtensions: [mdxFromMarkdown()],
  });
}

export function extractExamples(file: string, src: string): ExampleGroup[] {
  const tree = parseMdx(src);
  const groups: ExampleGroup[] = [];
  let groupSeq = 0;

  // Build ordered list of top-level nodes that matter:
  // - mdxFlowExpression (may be a skip marker)
  // - mdxJsxFlowElement with name === 'Tabs'
  // - code nodes
  // We walk children in document order and track the most recent pending skip.

  function extractCodeBlock(node: any, groupId: string | null): CodeBlock | null {
    const lang = normalizeLang(node.lang);
    if (!lang) return null;
    return {
      lang,
      code: node.value ?? '',
      file,
      startLine: node.position.start.line,
      endLine: node.position.end.line,
      groupId,
      skip: false,
    };
  }

  // Parse skip annotation value from an mdxFlowExpression node.
  // The node.value looks like: /* example:skip <reason> */
  function parseSkip(node: any): { reason: string } | null {
    const value: string = node.value ?? '';
    if (!value.includes('example:skip')) return null;
    // Strip the /* ... */ wrapper and extract the reason after "example:skip"
    const inner = value.replace(/^\/\*\s*/, '').replace(/\s*\*\/$/, '').trim();
    const m = inner.match(/^example:skip\s*([\s\S]*)$/);
    const reason = m ? m[1].trim() : '';
    return { reason };
  }

  // Parse a response annotation from an mdxFlowExpression node.
  // The node.value looks like: /* example:response 200 */
  function parseResponseMarker(node: any): { status: string } | null {
    const value: string = node.value ?? '';
    const m = value.match(/example:response\s+(\d{3})/);
    return m ? { status: m[1] } : null;
  }

  // Extract the plain-text of a heading node (concatenate child text values).
  function headingText(node: any): string {
    let text = '';
    visit(node, 'text', (t: any) => { text += t.value ?? ''; });
    return text.trim();
  }

  // Document-order traversal: carry a pending skip / response marker forward to
  // the next Tabs or code node, then consume it. Also track whether the most
  // recent heading was a "Response" heading (case-insensitive) so a JSON block
  // following it is treated as a response candidate (the explicit marker wins).
  let pendingSkip: { reason: string } | null = null;
  let pendingResponse: { status: string } | null = null;
  let pendingIgnore: { kinds: string[]; reason: string } | null = null;
  // One-shot carry: a "### Response" heading marks ONLY the first following
  // code/Tabs block as a response candidate. It is consumed-and-cleared like
  // the other pending carries so a second block under the same heading is not
  // misrouted to the response branch. An explicit example:response marker still
  // wins when both are present.
  let pendingResponseFromHeading = false;

  for (const node of (tree.children as any[])) {
    if (node.type === 'mdxFlowExpression') {
      const s = parseSkip(node);
      if (s) {
        // A skip marker — hold it for the next emittable node
        pendingSkip = s;
      }
      const r = parseResponseMarker(node);
      if (r) {
        // A response marker — hold it for the next emittable node
        pendingResponse = r;
      }
      const ig = parseIgnoreMarker(node.value ?? '');
      if (ig) {
        // A validate:ignore marker — hold it for the next emittable node
        pendingIgnore = ig;
      }
      continue;
    }

    if (node.type === 'heading') {
      // A "Response" heading (e.g. "### Response") marks the NEXT code/Tabs
      // block as an implicit status-200 response candidate (unless an explicit
      // marker overrides it). A non-Response heading clears any pending carry.
      pendingResponseFromHeading = /^response/i.test(headingText(node));
      continue;
    }

    if (node.type === 'mdxJsxFlowElement' && node.name === 'Tabs') {
      const groupId = `${file}:${node.position.start.line}#${groupSeq++}`;
      const blocks: CodeBlock[] = [];
      visit(node, 'code', (c: any) => {
        const b = extractCodeBlock(c, groupId);
        if (b) blocks.push(b);
      });
      if (blocks.length) {
        const skip = pendingSkip;
        pendingSkip = null; // consume
        const response = pendingResponse ?? (pendingResponseFromHeading ? { status: '200' } : null);
        pendingResponse = null; // consume
        pendingResponseFromHeading = false; // consume (one-shot)
        if (response) for (const b of blocks) b.responseStatus = response.status;
        const ignore = pendingIgnore;
        pendingIgnore = null; // consume
        groups.push({
          groupId,
          file,
          blocks,
          skip: !!skip,
          skipReason: skip?.reason,
          responseStatus: response?.status,
          ignore: ignore ?? undefined,
        });
      }
      continue;
    }

    if (node.type === 'code') {
      const b = extractCodeBlock(node, null);
      if (b) {
        const skip = pendingSkip;
        pendingSkip = null; // consume
        const response = pendingResponse ?? (pendingResponseFromHeading ? { status: '200' } : null);
        pendingResponse = null; // consume
        pendingResponseFromHeading = false; // consume (one-shot)
        if (response) b.responseStatus = response.status;
        const ignore = pendingIgnore;
        pendingIgnore = null; // consume
        groups.push({
          groupId: null,
          file,
          blocks: [b],
          skip: !!skip,
          skipReason: skip?.reason,
          responseStatus: response?.status,
          ignore: ignore ?? undefined,
        });
      }
      continue;
    }

    // Any other structural node (paragraph, thematicBreak, etc.) does NOT
    // consume the pending skip / response marker — only code/Tabs nodes do.
  }

  return groups;
}
