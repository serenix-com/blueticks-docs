import { Tabs, Tab } from 'fumadocs-ui/components/tabs';
import { DynamicCodeBlock } from 'fumadocs-ui/components/dynamic-codeblock';
import openapiSpec from '@/openapi.json';
import { buildRequestExample, buildResponseExample, resolveOp } from '@/lib/example-engine';
import { buildCodeSamples } from '@/lib/openapi';

type Lang = 'curl' | 'python' | 'node' | 'php' | 'ruby' | 'go' | 'json';

interface ApiExampleProps {
  op: string; // "POST /v1/messages"
  kind?: 'request' | 'response';
  status?: string; // response only
  lang?: Lang; // omit → all langs as tabs
}

const LABELS: Record<string, string> = {
  curl: 'cURL',
  python: 'Python',
  node: 'Node.js',
  php: 'PHP',
  ruby: 'Ruby',
  go: 'Go',
  json: 'JSON',
};

// fumadocs code-sample `lang` value → (our tab key, syntax-highlight lang).
const SDK_LANGS: Record<string, { key: Lang; codeLang: string }> = {
  python: { key: 'python', codeLang: 'python' },
  ts: { key: 'node', codeLang: 'typescript' },
  php: { key: 'php', codeLang: 'php' },
  ruby: { key: 'ruby', codeLang: 'ruby' },
  go: { key: 'go', codeLang: 'go' },
};

export function ApiExample({ op, kind = 'request', status, lang }: ApiExampleProps) {
  const spec = openapiSpec as any;
  const resolved = resolveOp(spec, op);
  if (!resolved) throw new Error(`<ApiExample>: unknown operation "${op}" — not found in openapi.json`);

  const samples: Array<{ key: Lang; label: string; code: string; codeLang: string }> = [];

  if (kind === 'response') {
    const ex = buildResponseExample(spec, op, status);
    if (!ex) throw new Error(`<ApiExample>: no response for "${op}"${status ? ` status ${status}` : ''}`);
    samples.push({ key: 'json', label: `${ex.status}`, code: ex.perLang.json, codeLang: 'json' });
  } else {
    const ex = buildRequestExample(spec, op)!;
    if (ex.perLang.curl) samples.push({ key: 'curl', label: LABELS.curl, code: ex.perLang.curl, codeLang: 'bash' });
    for (const s of buildCodeSamples(resolved.verb.toUpperCase(), resolved.path, resolved.op)) {
      const m = SDK_LANGS[s.lang];
      if (m) samples.push({ key: m.key, label: LABELS[m.key], code: s.source, codeLang: m.codeLang });
    }
    if (ex.perLang.json) samples.push({ key: 'json', label: LABELS.json, code: ex.perLang.json, codeLang: 'json' });
  }

  const shown = lang ? samples.filter((s) => s.key === lang) : samples;
  if (shown.length === 1) {
    return <DynamicCodeBlock lang={shown[0].codeLang} code={shown[0].code} />;
  }
  return (
    <Tabs items={shown.map((s) => s.label)}>
      {shown.map((s) => (
        <Tab key={s.key} value={s.label}>
          <DynamicCodeBlock lang={s.codeLang} code={s.code} />
        </Tab>
      ))}
    </Tabs>
  );
}
