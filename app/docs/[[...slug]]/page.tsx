import { getPageImage, getPageMarkdownUrl, source } from '@/lib/source';
import {
  DocsBody,
  DocsDescription,
  DocsPage,
  DocsTitle,
  MarkdownCopyButton,
  ViewOptionsPopover,
} from 'fumadocs-ui/layouts/docs/page';
import { notFound } from 'next/navigation';
import { getMDXComponents } from '@/components/mdx';
import type { Metadata } from 'next';
import { createRelativeLink } from 'fumadocs-ui/mdx';
import { gitConfig } from '@/lib/shared';

export default async function Page(props: PageProps<'/docs/[[...slug]]'>) {
  const params = await props.params;
  const page = source.getPage(params.slug);
  if (!page) notFound();

  const MDX = page.data.body;
  const markdownUrl = getPageMarkdownUrl(page).url;

  // Suno reference pages are debug-gated: they only show when the visitor set
  // localStorage 'bt-debug' === 'true' (a pre-hydration script in the root
  // layout stamps html[data-bt-debug="true"]). We can't 404 server-side since
  // the flag is client-only, so we render the page but wrap its meaningful
  // content in [data-bt-suno-content] and add a [data-bt-suno-fallback] note;
  // CSS in global.css hides one or the other based on the debug attribute.
  const isSuno = page.slugs[0] === 'api' && page.slugs[1] === 'suno';

  const body = (
    <>
      <DocsTitle>{page.data.title}</DocsTitle>
      <DocsDescription className="mb-0">{page.data.description}</DocsDescription>
      <div className="flex flex-row gap-2 items-center border-b pb-6">
        <MarkdownCopyButton markdownUrl={markdownUrl} />
        <ViewOptionsPopover
          markdownUrl={markdownUrl}
          githubUrl={`https://github.com/${gitConfig.user}/${gitConfig.repo}/blob/${gitConfig.branch}/content/docs/${page.path}`}
        />
      </div>
      <DocsBody>
        <MDX
          components={getMDXComponents({
            // this allows you to link to other pages with relative file paths
            a: createRelativeLink(source, page),
          })}
        />
      </DocsBody>
    </>
  );

  return (
    <DocsPage toc={page.data.toc} full={page.data.full}>
      {isSuno ? (
        <>
          <div data-bt-suno-fallback className="text-fd-muted-foreground">
            This section isn’t available.
          </div>
          <div data-bt-suno-content>{body}</div>
        </>
      ) : (
        body
      )}
    </DocsPage>
  );
}

export async function generateStaticParams() {
  return source.generateParams();
}

export async function generateMetadata(props: PageProps<'/docs/[[...slug]]'>): Promise<Metadata> {
  const params = await props.params;
  const page = source.getPage(params.slug);
  if (!page) notFound();

  return {
    title: page.data.title,
    description: page.data.description,
    openGraph: {
      images: getPageImage(page).url,
    },
  };
}
