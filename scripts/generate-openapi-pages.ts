#!/usr/bin/env node
/*
 * Regenerates content/docs/api/* from openapi.json.
 * Invoked as `prebuild` by `pnpm build`.
 *
 * fumadocs-openapi v10 API notes:
 *   - generateFiles() takes { input: OpenAPIServer, output: string, per?, groupBy?, meta? }
 *   - OpenAPIServer is created via createOpenAPI({ input: string[] })
 *   - The generated MDX files emit <APIPage> tags — wire this component in components/mdx.tsx
 */

import { generateFiles } from 'fumadocs-openapi';
import { createOpenAPI } from 'fumadocs-openapi/server';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';

const OUTPUT_DIR = 'content/docs/api';
const SPEC_PATH = './openapi.json';

async function main(): Promise<void> {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  // Wipe the generated tag folders before regenerating. fumadocs writes
  // new files but doesn't remove orphans (e.g. when a path is dropped or
  // its summary changes). Without this cleanup, stale MDX files
  // accumulate in tag folders even though they're no longer in meta.json.
  // The hand-written index.mdx is preserved; everything else under
  // OUTPUT_DIR is regenerated.
  for (const ent of await fs.readdir(OUTPUT_DIR, { withFileTypes: true })) {
    if (ent.name === 'index.mdx') continue;
    await fs.rm(join(OUTPUT_DIR, ent.name), { recursive: true, force: true });
  }
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  const raw = await fs.readFile(SPEC_PATH, 'utf8');
  const spec = JSON.parse(raw) as { paths?: Record<string, Record<string, unknown>> };

  const server = createOpenAPI({
    input: [SPEC_PATH],
  });

  // Flatten file paths under each tag folder.
  // Default v2 algorithm produces e.g. `audiences/v1/audiences/id/contacts/post.mdx`
  // — verbose URL-segment nesting that bloats the sidebar. We replace it with
  // a slug derived from the operation summary ("Append contacts to audience" ->
  // "append-contacts-to-audience"), falling back to method+path when summary
  // is absent. One file per operation, all siblings under the tag folder.
  const slugify = (s: string): string =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

  const usedNames = new Map<string, number>();

  await generateFiles({
    input: server,
    output: OUTPUT_DIR,
    per: 'operation',
    groupBy: 'tag',
    meta: true,
    name: (output) => {
      const summary = output.info.title;
      const item = (output as { item?: { method?: string; path?: string } }).item;
      const fallback = `${item?.method ?? 'op'}-${(item?.path ?? '').replace(/^\/+|\/+$/g, '').replace(/[/{}]+/g, '-')}`;
      const base = summary ? slugify(summary) : slugify(fallback);
      // De-dupe within a tag — append -2, -3 if multiple ops share a summary
      const count = (usedNames.get(base) ?? 0) + 1;
      usedNames.set(base, count);
      return count === 1 ? base : `${base}-${count}`;
    },
    frontmatter: (title, description) => ({
      title,
      // Frontmatter description is rendered as a flat paragraph at the
      // top of the page — no markdown processing. Strip to just the
      // first sentence/line so multi-line variant breakdowns don't
      // appear as a wall of text. Long-form description (variant
      // examples, etc.) lands in the MDX body via the post-process
      // step below, where markdown renders properly.
      description: firstSentence(description),
      full: true,
    }),
  });

  // Post-process the generated MDX files: inject the operation's full
  // markdown description into the MDX BODY as a prose block above
  // <APIPage>. The frontmatter description was truncated to the first
  // sentence (above), so we need the long-form variant breakdown
  // rendered here where Fumadocs MDX processes markdown properly.
  const mdxFiles = await collectMdx(OUTPUT_DIR);
  const opDescriptions = collectOperationDescriptions(spec);
  for (const file of mdxFiles) {
    let content = await fs.readFile(file, 'utf8');
    const op = matchOperation(content, opDescriptions);
    if (op && op.body) {
      content = injectDescriptionBody(content, op.body);
    }
    await fs.writeFile(file, content);
  }

  // Flatten single-operation tag folders. fumadocs groups every tag into a
  // folder with its own meta.json, so a tag with just one operation renders
  // as a collapsible dropdown wrapping a single link — redundant nesting.
  // We promote the lone page to a top-level file named after the tag
  // (e.g. api/ping/ping.mdx -> api/ping.mdx). The new file's slug equals the
  // folder slug, so the parent meta.json's "ping" entry resolves to it
  // unchanged — no meta rewrite needed. The page title is set to the tag
  // title so the sidebar shows the resource name.
  await flattenSingleOperationTags(OUTPUT_DIR);

  // Copy spec to public/ so /openapi.json is served verbatim for Postman etc.
  await fs.mkdir('public', { recursive: true });
  await fs.copyFile(SPEC_PATH, join('public', 'openapi.json'));

  console.log(`[openapi] regenerated ${OUTPUT_DIR} from ${SPEC_PATH}`);
}

/**
 * Take the first sentence of a description (or first line if no full
 * stop). Used for the MDX frontmatter `description` field, which is
 * rendered as plain text by Fumadocs — markdown lists/bold are shown
 * literally, so longer multi-line content has to live in the MDX body.
 */
function firstSentence(text: string | undefined): string {
  if (!text) return '';
  const trimmed = text.trim();
  // First period followed by space/newline/EOS, or first newline.
  const m = trimmed.match(/^(.+?[.!?])(?=\s|$)/s);
  if (m) return m[1].trim();
  return trimmed.split(/\r?\n/)[0]!.trim();
}

interface OpDesc {
  path: string;
  method: string;
  summary: string;
  // Long-form portion of the description (everything AFTER the first
  // sentence). Empty when the description is short enough to live
  // entirely in the frontmatter.
  body: string;
}

function collectOperationDescriptions(spec: any): OpDesc[] {
  const out: OpDesc[] = [];
  for (const [p, item] of Object.entries(spec.paths ?? {}) as [string, any][]) {
    for (const [method, op] of Object.entries(item)) {
      if (!op || typeof op !== 'object' || Array.isArray(op)) continue;
      const o = op as { summary?: string; description?: string };
      if (!o.description) continue;
      const head = firstSentence(o.description);
      const body = o.description.trim().slice(head.length).trim();
      out.push({ path: p, method, summary: o.summary ?? '', body });
    }
  }
  return out;
}

function matchOperation(mdxContent: string, ops: OpDesc[]): OpDesc | undefined {
  // Each generated MDX has an APIPage tag like:
  //   <APIPage document={"./openapi.json"} operations={[{"path":"/v1/messages","method":"post"}]} />
  const m = mdxContent.match(/operations=\{\[\{"path":"([^"]+)","method":"([^"]+)"\}\]\}/);
  if (!m) return undefined;
  const [, path, method] = m;
  return ops.find((o) => o.path === path && o.method === method);
}

function injectDescriptionBody(mdxContent: string, body: string): string {
  // Insert the long-form description as a prose block immediately
  // before <APIPage. Fumadocs MDX renders this as full markdown.
  const apiPageMatch = mdxContent.indexOf('<APIPage');
  if (apiPageMatch === -1) return mdxContent;
  const before = mdxContent.slice(0, apiPageMatch);
  const after = mdxContent.slice(apiPageMatch);
  return `${before}${body}\n\n${after}`;
}

/**
 * Promote each single-operation tag folder to a top-level MDX file, removing
 * the redundant one-item dropdown from the sidebar. A folder qualifies when
 * it holds exactly one .mdx and no subdirectories. The lone page is moved to
 * `<tag>.mdx` (folder slug == file slug, so the parent meta.json entry still
 * resolves) and its title is overridden with the tag title from the folder's
 * meta.json.
 */
async function flattenSingleOperationTags(dir: string): Promise<void> {
  for (const ent of await fs.readdir(dir, { withFileTypes: true })) {
    if (!ent.isDirectory()) continue;
    const folder = join(dir, ent.name);
    const entries = await fs.readdir(folder, { withFileTypes: true });
    const mdx = entries.filter((e) => e.isFile() && e.name.endsWith('.mdx'));
    const hasSubdir = entries.some((e) => e.isDirectory());
    if (mdx.length !== 1 || hasSubdir) continue;

    // Tag title from the folder meta.json; fall back to the folder slug.
    let tagTitle = ent.name;
    try {
      const meta = JSON.parse(
        await fs.readFile(join(folder, 'meta.json'), 'utf8'),
      ) as { title?: string };
      if (typeof meta.title === 'string' && meta.title) tagTitle = meta.title;
    } catch {
      // No meta.json — keep the folder slug as the title.
    }

    const content = setFrontmatterTitle(
      await fs.readFile(join(folder, mdx[0]!.name), 'utf8'),
      tagTitle,
    );
    await fs.rm(folder, { recursive: true, force: true });
    await fs.writeFile(join(dir, `${ent.name}.mdx`), content);
  }
}

/** Rewrite the `title:` field inside the leading YAML frontmatter block. */
function setFrontmatterTitle(mdx: string, title: string): string {
  const fm = mdx.match(/^---\r?\n[\s\S]*?\r?\n---/);
  if (!fm) return mdx;
  const escaped = title.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const rewritten = fm[0].replace(/^title:.*$/m, `title: "${escaped}"`);
  return mdx.replace(fm[0], rewritten);
}

async function collectMdx(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const ent of await fs.readdir(dir, { withFileTypes: true })) {
    const full = join(dir, ent.name);
    if (ent.isDirectory()) {
      out.push(...(await collectMdx(full)));
    } else if (ent.name.endsWith('.mdx')) {
      out.push(full);
    }
  }
  return out;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
