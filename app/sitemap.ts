import type { MetadataRoute } from 'next';
import { source } from '@/lib/source';
import { buildSitemapEntries } from '@/lib/sitemap';

export const revalidate = false;

export default function sitemap(): MetadataRoute.Sitemap {
  return buildSitemapEntries(source.getPages());
}
