import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import type { Finding, Lang } from './types';

type Spec = { components?: { schemas?: Record<string, any> }; paths?: any };
type ResolvedOp = { verb: string; path: string; requestSchemaPointer: string | null };

function levenshtein(a: string, b: string): number {
  const dp: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[a.length][b.length];
}

function deref(spec: Spec, schema: any): any {
  if (schema && typeof schema.$ref === 'string') {
    const ptr = schema.$ref.replace(/^#\//, '').split('/');
    let cur: any = spec;
    for (const seg of ptr) cur = cur?.[seg.replace(/~1/g, '/').replace(/~0/g, '~')];
    return cur;
  }
  return schema;
}

/**
 * Given a schema that may be a oneOf+discriminator, attempt to select the
 * matching variant based on the body's discriminator property.
 *
 * Returns:
 *   - schema: the resolved variant schema object (for structural walking)
 *   - variantRef: the $ref string from the mapping (e.g. '#/components/schemas/SendPoll'),
 *                 which we can convert to an ajv pointer by prepending 'openapi'
 *   - badDiscriminator: the property name if the discriminator value was invalid
 */
function resolveVariant(
  spec: Spec,
  schema: any,
  body: Record<string, unknown>,
): { schema: any; variantRef: string | null; badDiscriminator?: string } {
  const s = deref(spec, schema);
  if (s?.oneOf && s.discriminator) {
    const prop = s.discriminator.propertyName as string;
    const val = body[prop];
    const map = s.discriminator.mapping as Record<string, string> | undefined;
    if (typeof val === 'string' && map && map[val]) {
      return { schema: deref(spec, { $ref: map[val] }), variantRef: map[val] };
    }
    // Bad or missing discriminator value
    return { schema: s, variantRef: null, badDiscriminator: prop };
  }
  return { schema: s, variantRef: null };
}

type PartialFinding = Omit<Finding, 'file' | 'line' | 'groupId' | 'lang'>;

function walkUnknown(spec: Spec, schema: any, body: any, path: string, out: PartialFinding[]) {
  const s = deref(spec, schema);
  const properties = s?.properties ?? {};
  if (body && typeof body === 'object' && !Array.isArray(body)) {
    for (const key of Object.keys(body)) {
      const dotted = path ? `${path}.${key}` : key;
      if (!(key in properties)) {
        const candidates = Object.keys(properties);
        const near = candidates.find((c) => levenshtein(c, key) <= 2);
        out.push({
          kind: 'unknown-field',
          field: dotted,
          message: `Unknown field '${dotted}' (not in schema)`,
          suggestion: near,
          fixable: !!near,
        });
      } else {
        walkUnknown(spec, properties[key], body[key], dotted, out);
      }
    }
  }
}

export function checkBody(
  body: Record<string, unknown>,
  op: ResolvedOp,
  spec: Spec,
  base: { file: string; line: number; groupId: string | null },
  lang: Lang,
): Finding[] {
  const out: PartialFinding[] = [];
  if (!op.requestSchemaPointer) return [];

  // Resolve root schema from pointer (e.g. 'openapi#/components/schemas/SendMessageRequest')
  const pointerPath = op.requestSchemaPointer.split('#')[1]; // '/components/schemas/SendMessageRequest'
  const rootSchema = deref(spec, { $ref: '#' + pointerPath });

  // Attempt discriminator resolution
  const { schema: variant, variantRef, badDiscriminator } = resolveVariant(spec, rootSchema, body);

  if (badDiscriminator) {
    const present = body[badDiscriminator] !== undefined;
    out.push({
      kind: present ? 'bad-enum' : 'missing-required',
      field: badDiscriminator,
      badValue: present ? String(body[badDiscriminator]) : undefined,
      message: present
        ? `Invalid discriminator value '${String(body[badDiscriminator])}' for '${badDiscriminator}'`
        : `Missing required discriminator field '${badDiscriminator}'`,
      fixable: false,
    });
    // Return early — don't run structural checks or ajv with an invalid discriminator
    // (the body's type is wrong so everything else would be noise)
    return out.map((f) => ({ ...f, file: base.file, line: base.line, groupId: base.groupId, lang }));
  }

  // 1) Unknown fields (structural walk; applies for every lang)
  walkUnknown(spec, variant, body, '', out);

  // 2) ajv for required / enum / type / format
  // Use the variant schema pointer when available (avoids oneOf noise from the root discriminated schema)
  const ajvPointer = variantRef
    ? 'openapi' + variantRef  // e.g. 'openapi#/components/schemas/SendPoll'
    : op.requestSchemaPointer; // fallback to root pointer for non-discriminated schemas

  const ajv = new Ajv({ strict: false, allErrors: true });
  addFormats(ajv);
  ajv.addSchema(spec, 'openapi');
  const validate = ajv.getSchema(ajvPointer);
  if (validate) {
    const ok = validate(body);
    if (!ok) {
      for (const err of validate.errors ?? []) {
        const field = (err.instancePath || '').replace(/^\//, '').replace(/\//g, '.');

        if (err.keyword === 'required') {
          out.push({
            kind: 'missing-required',
            field: err.params.missingProperty,
            message: `Missing required field '${err.params.missingProperty}'`,
            fixable: false,
          });
        } else if (err.keyword === 'enum' && (lang === 'json' || lang === 'bash')) {
          out.push({
            kind: 'bad-enum',
            field: field || 'type',
            badValue: String((body as any)[field]),
            message: `Invalid enum value for '${field}'`,
            fixable: false,
          });
        } else if (
          lang === 'json' || lang === 'bash'
        ) {
          // Skip noisy structural keywords — unknown-field walk handles those
          if (
            err.keyword !== 'additionalProperties' &&
            err.keyword !== 'oneOf' &&
            err.keyword !== 'discriminator'
          ) {
            out.push({
              kind: 'schema-invalid',
              field,
              message: ajv.errorsText([err]),
              fixable: false,
            });
          }
        }
      }
    }
  }

  // De-dupe by kind+field; stamp location
  const seen = new Set<string>();
  const findings: Finding[] = [];
  for (const f of out) {
    const k = `${f.kind}:${f.field}`;
    if (seen.has(k)) continue;
    seen.add(k);
    findings.push({ ...f, file: base.file, line: base.line, groupId: base.groupId, lang });
  }
  return findings;
}
