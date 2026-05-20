import defaultMdxComponents from 'fumadocs-ui/mdx';
import type { MDXComponents } from 'mdx/types';
import { createAPIPage } from 'fumadocs-openapi/ui';
import { createCodeUsageGeneratorRegistry } from 'fumadocs-openapi/requests/generators';
import { curl } from 'fumadocs-openapi/requests/generators/curl';
import { openapi } from '@/lib/openapi';
import { AppLink } from '@/components/app-link';

// Trim the default code-generator registry to just cURL. Python / Node.js / PHP
// come in per-operation via `x-codeSamples` injected in lib/openapi.ts.
// Dropping fumadocs's auto-generated Go / Java / C# / JavaScript-fetch raw-HTTP
// tabs aligns the reference with the hand-written guides (which only target
// the SDKs we actually ship).
const sdkOnlyRegistry = createCodeUsageGeneratorRegistry();
sdkOnlyRegistry.add('curl', curl);

// Operation layout — promote the code samples (`apiExample`) to a full-width
// band at the top, drop the static `authSchemes` and `parameters` sections
// (the playground card's Authorization / Query collapsibles render the same
// info), and stack the rest vertically.
const APIPage = createAPIPage(openapi, {
  codeUsages: sdkOnlyRegistry,
  content: {
    renderOperationLayout: (slots) => (
      <div className="space-y-6">
        {slots.header}
        {slots.description}
        {slots.apiExample}
        {slots.apiPlayground}
        {slots.body}
        {slots.responses}
        {slots.callbacks}
      </div>
    ),
  },
});

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
