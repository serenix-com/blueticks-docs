import defaultMdxComponents from 'fumadocs-ui/mdx';
import type { MDXComponents } from 'mdx/types';
import { createAPIPage } from 'fumadocs-openapi/ui';
import { openapi } from '@/lib/openapi';
import { AppLink } from '@/components/app-link';

const APIPage = createAPIPage(openapi);

export function getMDXComponents(components?: MDXComponents) {
  return {
    ...defaultMdxComponents,
    APIPage,
    AppLink,
    ...components,
  } satisfies MDXComponents;
}

export const useMDXComponents = getMDXComponents;

declare global {
  type MDXProvidedComponents = ReturnType<typeof getMDXComponents>;
}
