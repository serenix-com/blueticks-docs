'use client';

// Adds an "Attach a file" control to the API playground's Body panel, with a
// content-type dropdown (application/json | multipart/form-data) right next to
// the file picker. The *regular* Send button does the sending:
//
//   • application/json    → the file is read as base64 into the operation's
//     base64 field and sent in the JSON body (small files; 10 MB JSON limit).
//   • multipart/form-data → the file is staged (see lib/staged-upload) and the
//     createAPIPage `onRequestInit` hook rewrites the request to multipart,
//     uploading the raw bytes (no size inflation, no JSON limit).
//
// There is no separate "Send file" button — the dropdown is the only control,
// and it changes how the next Send is encoded.
//
// Regeneration-safe: this lives in components/ (wired via createAPIPage in
// components/mdx.tsx), which `generate:openapi` never rewrites.
//
// Reusable: `createUploadBodyPanel([...configs])` takes one config per media
// operation — each names that operation's base64 field + multipart file part.
// The panel auto-detects which one applies on a page. Pair it with
// `createMultipartRewrite()` from lib/staged-upload in the same config.

import { useEffect, useState } from 'react';
import {
  Custom,
  DefaultCollapsiblePanel,
  type CollapsiblePanelProps,
} from 'fumadocs-openapi/playground/client';
import { stagedUpload, createMultipartRewrite } from '@/lib/staged-upload';

export interface UploadFieldConfig {
  /** JSON body field that holds the inline base64 (e.g. `mediaBase64`). */
  base64Field: string;
  /** Multipart part name the server reads the file from (e.g. `mediaFile`). */
  fileField: string;
  /** Text that scopes the panel to this operation. Defaults to `base64Field`. */
  detectToken?: string;
}

type ContentType = 'application/json' | 'multipart/form-data';

// Files at/under this size are safe for the JSON path; express.json caps the
// body at 10 MB and base64 inflates ~33%.
const INLINE_SAFE_BYTES = 7 * 1024 * 1024;

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

function UploadControls({ config }: { config: UploadFieldConfig }) {
  const base64 = Custom.useController(['body', config.base64Field]);
  const [ct, setCt] = useState<ContentType>('application/json');
  const [status, setStatus] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);

  // Drop any staged file when the user navigates away.
  useEffect(() => () => stagedUpload.clear(), []);

  const apply = async (f: File | null, mode: ContentType) => {
    if (!f) {
      stagedUpload.clear();
      base64.setValue('');
      setStatus(null);
      return;
    }
    if (mode === 'multipart/form-data') {
      // Stage for the onRequestInit rewrite; don't also carry base64 in JSON.
      stagedUpload.set({
        file: f,
        fileField: config.fileField,
        excludeFields: [config.base64Field, config.fileField],
      });
      base64.setValue('');
      setStatus(`"${f.name}" will upload as multipart/form-data when you press Send.`);
      return;
    }
    // application/json → inline base64
    stagedUpload.clear();
    if (f.size > INLINE_SAFE_BYTES) {
      base64.setValue('');
      setStatus(
        `⚠ ${(f.size / 1048576).toFixed(1)} MB is too large for application/json (10 MB body limit). Switch to multipart/form-data.`,
      );
      return;
    }
    base64.setValue(await readAsDataUrl(f));
    setStatus(`"${f.name}" → ${config.base64Field} set. Press Send.`);
  };

  return (
    <div className="col-span-full flex flex-col gap-2 rounded-lg border border-fd-border p-3">
      <span className="text-xs font-medium font-mono text-fd-foreground">Attach a file</span>
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="file"
          className="text-sm text-fd-muted-foreground file:me-3 file:rounded-md file:border file:border-fd-border file:bg-fd-secondary file:px-3 file:py-1.5 file:text-fd-secondary-foreground file:text-sm hover:file:bg-fd-accent"
          onChange={(e) => {
            const f = e.target.files?.[0] ?? null;
            setFile(f);
            void apply(f, ct);
          }}
        />
        <label className="flex items-center gap-1.5 text-sm text-fd-muted-foreground">
          Send as
          <select
            value={ct}
            onChange={(e) => {
              const next = e.target.value as ContentType;
              setCt(next);
              void apply(file, next);
            }}
            className="rounded-md border border-fd-border bg-fd-background px-2 py-1 text-sm text-fd-foreground"
          >
            <option value="application/json">application/json (base64)</option>
            <option value="multipart/form-data">multipart/form-data (file)</option>
          </select>
        </label>
      </div>
      {status ? <span className="text-xs text-fd-muted-foreground">{status}</span> : null}
    </div>
  );
}

/**
 * Build the playground CollapsiblePanel override. On a Body panel it picks the
 * first config whose `detectToken` is present on the page and renders the file
 * controls for it; if none match (non-media operation) it's the default panel.
 */
export function createUploadBodyPanel(configs: UploadFieldConfig[]) {
  return function UploadBodyPanel(props: CollapsiblePanelProps) {
    const isBody = props['data-type'] === 'body';
    const [active, setActive] = useState<UploadFieldConfig | null>(null);

    // The interactive panel mounts/unmounts with the collapsible, but the
    // read-only schema section names the field synchronously, so a
    // document-wide signal is reliable regardless of collapse/expand timing.
    useEffect(() => {
      if (!isBody) return;
      const match = () =>
        configs.find((c) => (document.body.textContent ?? '').includes(c.detectToken ?? c.base64Field)) ?? null;
      const found = match();
      if (found) {
        setActive(found);
        return;
      }
      const obs = new MutationObserver(() => {
        const f = match();
        if (f) {
          setActive(f);
          obs.disconnect();
        }
      });
      obs.observe(document.body, { childList: true, subtree: true, characterData: true });
      return () => obs.disconnect();
    }, [isBody]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Default = DefaultCollapsiblePanel as any;
    return (
      <Default {...props}>
        {props.children}
        {isBody && active ? <UploadControls config={active} /> : null}
      </Default>
    );
  };
}

// Pre-bound for this API. The factories are bound here — inside the client
// module — because a server module (components/mdx.tsx) cannot invoke a client
// function. One config per media operation:
//   • POST /v1/messages/{chat_id}  — mediaBase64 / mediaFile
//   • PUT  /v1/groups/{id}/picture — file_data_url / file
// Add a new operation by appending its { base64Field, fileField } here.
export const PlaygroundBodyPanel = createUploadBodyPanel([
  { base64Field: 'mediaBase64', fileField: 'mediaFile' },
  { base64Field: 'file_data_url', fileField: 'file' },
]);
export const playgroundMultipartRewrite = createMultipartRewrite();
