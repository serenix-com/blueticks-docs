import { fromMarkdown } from 'mdast-util-from-markdown';
import { mdxjs } from 'micromark-extension-mdxjs';
import { mdxFromMarkdown } from 'mdast-util-mdx';
import { visit } from 'unist-util-visit';
import type { CodeBlock, ExampleGroup, Lang } from './types';

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

  // Document-order traversal: carry a pending skip forward to the
  // next Tabs or code node, then consume it.
  let pendingSkip: { reason: string } | null = null;

  for (const node of (tree.children as any[])) {
    if (node.type === 'mdxFlowExpression') {
      const s = parseSkip(node);
      if (s) {
        // A skip marker — hold it for the next emittable node
        pendingSkip = s;
      }
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
        groups.push({
          groupId,
          file,
          blocks,
          skip: !!skip,
          skipReason: skip?.reason,
        });
      }
      continue;
    }

    if (node.type === 'code') {
      const b = extractCodeBlock(node, null);
      if (b) {
        const skip = pendingSkip;
        pendingSkip = null; // consume
        groups.push({
          groupId: null,
          file,
          blocks: [b],
          skip: !!skip,
          skipReason: skip?.reason,
        });
      }
      continue;
    }

    // Any other structural node (heading, paragraph, thematicBreak, etc.)
    // does NOT consume the pending skip — only code/Tabs nodes do.
    // This means a skip before a heading before a code block still applies.
    // However, if that is undesirable in edge cases, consider clearing
    // pendingSkip on headings (not needed for current tests).
  }

  return groups;
}
