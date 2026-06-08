import defaultMdxComponents from 'fumadocs-ui/mdx';
import type { MDXComponents } from 'mdx/types';
import { createAPIPage } from 'fumadocs-openapi/ui';
import { createCodeUsageGeneratorRegistry } from 'fumadocs-openapi/requests/generators';
import { curl } from 'fumadocs-openapi/requests/generators/curl';
import { Tab, Tabs } from 'fumadocs-ui/components/tabs';
import { Fragment } from 'react';
import { openapi, ERROR_RESPONSE_KEY } from '@/lib/openapi';
import { AppLink } from '@/components/app-link';
import { ApiExample } from '@/components/api-example';
import { ApiAutoExpand } from '@/components/api-auto-expand';
import { AuthFieldCustomizer } from '@/components/auth-field-customizer';
import { PrettyResultDisplay } from '@/components/pretty-result-display';
import { ResponseTabsRelocator } from '@/components/response-tabs-relocator';

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
// expanded on mount (see <ApiAutoExpand />). The example response payloads
// (apiExample.responseTabs) are split out from the code samples and
// re-anchored at the bottom of the page (see renderAPIExampleLayout +
// <ResponseTabsRelocator />).
const APIPage = createAPIPage(openapi, {
  codeUsages: sdkOnlyRegistry,
  // Override the playground's response viewer to pretty-print JSON bodies
  // (our API returns minified JSON, which otherwise shows as one cramped
  // line). A client-component override serializes across the RSC boundary;
  // see components/pretty-result-display.tsx + the height/scroll CSS.
  client: {
    playground: {
      components: { ResultDisplay: PrettyResultDisplay },
    },
  },
  // Drop the per-response "TypeScript Definitions" panels. The dedicated
  // Node.js SDK already exposes typed accessors; the auto-generated TS
  // type dump adds visual weight without helping callers who use the SDK.
  generateTypeScriptDefinitions: false,
  generateTypeScriptSchema: false,
  content: {
    // Response example tabs. The collapsed error response keys its accordion
    // "Error codes" (the status table); here we label its *example* tab
    // "Error response" instead. Each of our responses carries a single
    // example, so we stack examples rather than re-deriving the default
    // renderer's multi-example accordion.
    renderResponseTabs: (tabs, ctx) => {
      const label = (code: string) =>
        code === ERROR_RESPONSE_KEY ? 'Error response' : code;
      return (
        <Tabs
          groupId="fumadocs_openapi_responses"
          items={tabs.map((tab) => label(tab.code))}
        >
          {tabs.map((tab) => (
            <Tab key={label(tab.code)} value={label(tab.code)}>
              {(tab.examples ?? []).map((example, i) => (
                <Fragment key={i}>
                  {example.description
                    ? ctx.renderMarkdown(example.description)
                    : null}
                  {ctx.renderCodeBlock(
                    'json',
                    JSON.stringify(example.sample, null, 2),
                  )}
                </Fragment>
              ))}
            </Tab>
          ))}
        </Tabs>
      );
    },
    renderAPIExampleLayout: (slots) => (
      <>
        <div className="space-y-4">
          {slots.selector}
          {slots.usageTabs}
        </div>
        {/* Wrap the response-tabs so <ResponseTabsRelocator> can move them
            to the bottom of the page at runtime — see renderOperationLayout. */}
        <div data-relocate-response-tabs hidden>
          {slots.responseTabs}
        </div>
      </>
    ),
    renderOperationLayout: (slots) => (
      <div className="space-y-6">
        {slots.header}
        {slots.description}

        <section data-api-section="request" className="space-y-4">
          <h2 className="text-2xl font-semibold border-b border-fd-border pb-2 mt-8">
            Request
          </h2>
          {slots.apiExample}
          {slots.apiPlayground}
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

        {/* Anchor: the relocator moves [data-relocate-response-tabs] here
            and unhides it, so example response payloads land at the bottom. */}
        <div data-response-tabs-anchor className="mt-8" />

        {/* Auto-expand collapsed Accordions/Collapsibles inside the Request
            section so callers see the full request schema upfront. Response
            stays collapsed — the status accordions (200/400/…) are mostly
            the shared error envelope, so the reader opens just the status
            they care about. */}
        <ApiAutoExpand selector='[data-api-section="request"]' />
        {/* Set the API-key placeholder and hide the single-option auth-scheme
            dropdown in the playground's Authorization panel. */}
        <AuthFieldCustomizer placeholder="Enter your Blueticks API key" />
        <ResponseTabsRelocator />
      </div>
    ),
  },
});

export function getMDXComponents(components?: MDXComponents) {
  return {
    ...defaultMdxComponents,
    APIPage,
    AppLink,
    ApiExample,
    ...components,
  } satisfies MDXComponents;
}

export const useMDXComponents = getMDXComponents;

declare global {
  type MDXProvidedComponents = ReturnType<typeof getMDXComponents>;
}
