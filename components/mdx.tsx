import defaultMdxComponents from 'fumadocs-ui/mdx';
import type { MDXComponents } from 'mdx/types';
import { createAPIPage } from 'fumadocs-openapi/ui';
import { createCodeUsageGeneratorRegistry } from 'fumadocs-openapi/requests/generators';
import { curl } from 'fumadocs-openapi/requests/generators/curl';
import { openapi } from '@/lib/openapi';
import { AppLink } from '@/components/app-link';
import { ApiAutoExpand } from '@/components/api-auto-expand';

// Trim the default code-generator registry to just cURL. Python / Node.js / PHP
// come in per-operation via `x-codeSamples` injected in lib/openapi.ts.
// Dropping fumadocs's auto-generated Go / Java / C# / JavaScript-fetch raw-HTTP
// tabs aligns the reference with the hand-written guides (which only target
// the SDKs we actually ship).
const sdkOnlyRegistry = createCodeUsageGeneratorRegistry();
sdkOnlyRegistry.add('curl', curl);

// Operation layout — promote the code samples (`apiExample`) to a full-width
// band at the top, drop the static `authSchemes` section (the playground
// card's Authorization collapsible renders the same info), and group the
// rest under clear "Request" / "Response" banners with all schema fields
// expanded on mount (see <ApiAutoExpand />).
const APIPage = createAPIPage(openapi, {
  codeUsages: sdkOnlyRegistry,
  content: {
    renderOperationLayout: (slots) => (
      <div className="space-y-6">
        {slots.header}
        {slots.description}
        {slots.apiExample}
        {slots.apiPlayground}

        <section data-api-section="request" className="space-y-4">
          <h2 className="text-2xl font-semibold border-b border-fd-border pb-2 mt-8">
            Request
          </h2>
          {slots.parameters}
          {slots.body}
        </section>

        <section data-api-section="response" className="space-y-4">
          <h2 className="text-2xl font-semibold border-b border-fd-border pb-2 mt-8">
            Response
          </h2>
          {slots.responses}
        </section>

        {slots.callbacks}

        {/* Auto-expand collapsed Accordions/Collapsibles inside the Request
            and Response sections so callers see the full schema by default. */}
        <ApiAutoExpand selector='[data-api-section]' />
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
