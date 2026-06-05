export type Lang = 'python' | 'ts' | 'js' | 'bash' | 'json';

/** A single fenced code block extracted from a guide MDX file. */
export interface CodeBlock {
  lang: Lang;
  code: string;
  file: string;        // path relative to docs repo root
  startLine: number;   // 1-based, of the ``` fence opening line
  endLine: number;     // 1-based, of the closing fence line
  groupId: string | null;  // synthetic id of the enclosing <Tabs>, or null
  skip: boolean;       // preceded by {/* example:skip ... */}
  skipReason?: string;
}

/** All blocks belonging to one <Tabs> group (or one standalone block). */
export interface ExampleGroup {
  groupId: string | null;
  file: string;
  blocks: CodeBlock[];
  skip: boolean;
  skipReason?: string;
}

/** An OpenAPI operation a group was resolved to. */
export interface ResolvedOp {
  verb: string;   // lowercase, e.g. 'post'
  path: string;   // e.g. '/v1/scheduled-messages'
  /** JSON pointer into the registered spec, e.g. 'openapi#/components/schemas/SendMessageRequest'. */
  requestSchemaPointer: string | null;
}

export type FindingKind =
  | 'unknown-field'
  | 'bad-enum'
  | 'missing-required'
  | 'dead-endpoint'
  | 'unparseable'
  | 'schema-invalid';

export interface Finding {
  file: string;
  line: number;
  groupId: string | null;
  lang: Lang;
  kind: FindingKind;
  message: string;
  field?: string;        // dotted path, e.g. 'poll.allow_multiple'
  badValue?: string;     // the offending literal (for bad-enum)
  suggestion?: string;   // corrected token, when high-confidence
  fixable: boolean;      // true only for rename / enum single-token fixes
}
