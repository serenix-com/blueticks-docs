import type { MetadataRoute } from 'next';
import { buildRobots } from '@/lib/sitemap';

export default function robots(): MetadataRoute.Robots {
  return buildRobots();
}
