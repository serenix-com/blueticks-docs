import type { Metadata } from 'next';
import { SITE_URL } from './sitemap';

export interface DocsMetadataInput {
  title: string;
  description?: string;
  /** Site-relative page url, e.g. `/docs/webhooks`. */
  url: string;
  /** Site-relative og image url. */
  imageUrl: string;
}

/** Base that relative metadata urls (og:image, canonical) resolve against. */
export function rootMetadataBase(): URL {
  return new URL(SITE_URL);
}

export function buildDocsMetadata(input: DocsMetadataInput): Metadata {
  return {
    title: input.title,
    description: input.description,
    alternates: { canonical: input.url },
    openGraph: { images: input.imageUrl },
  };
}

export const SITE_DESCRIPTION =
  'The Blueticks API lets you send WhatsApp messages, manage gateways, and automate customer conversations from your own code.';

/** Site-wide defaults: metadataBase, a branded title template, and a description. */
export function buildRootMetadata(): Metadata {
  return {
    metadataBase: rootMetadataBase(),
    title: { default: 'Blueticks API docs', template: '%s | Blueticks API' },
    description: SITE_DESCRIPTION,
  };
}

export function buildHomeMetadata(): Metadata {
  return { alternates: { canonical: '/' } };
}
