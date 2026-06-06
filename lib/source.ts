import { docs } from 'collections/server';
import { loader } from 'fumadocs-core/source';
import { lucideIconsPlugin } from 'fumadocs-core/source/lucide-icons';
import { docsContentRoute, docsImageRoute, docsRoute } from './shared';

// See https://fumadocs.dev/docs/headless/source-api for more info
export const source = loader({
  baseUrl: docsRoute,
  source: docs.toFumadocsSource(),
  plugins: [lucideIconsPlugin()],
  // The OpenAPI generator emits every operation under a single `api/` folder
  // (title "API Reference"), which fumadocs renders as a collapsible dropdown
  // nested beneath the hand-written "Reference" section heading. That extra
  // level is redundant: spread the folder's children directly under the
  // heading and rename the heading to "API Reference", so the operations sit
  // one click away with no wrapping dropdown. Inlined (not a typed const) so
  // the transformer's node types infer from this loader's storage.
  pageTree: {
    transformers: [
      {
        root(node) {
          const children = node.children.flatMap((child) => {
            if (
              child.type === 'folder' &&
              (child.name === 'API Reference' ||
                (typeof child.$ref === 'string' &&
                  child.$ref.endsWith('/api/meta.json')))
            ) {
              return child.children;
            }
            if (child.type === 'separator' && child.name === 'Reference') {
              return { ...child, name: 'API Reference' };
            }
            return child;
          });
          return { ...node, children };
        },
      },
    ],
  },
});

export function getPageImage(page: (typeof source)['$inferPage']) {
  const segments = [...page.slugs, 'image.png'];

  return {
    segments,
    url: `${docsImageRoute}/${segments.join('/')}`,
  };
}

export function getPageMarkdownUrl(page: (typeof source)['$inferPage']) {
  const segments = [...page.slugs, 'content.md'];

  return {
    segments,
    url: `${docsContentRoute}/${segments.join('/')}`,
  };
}

export async function getLLMText(page: (typeof source)['$inferPage']) {
  const processed = await page.data.getText('processed');

  return `# ${page.data.title} (${page.url})

${processed}`;
}
