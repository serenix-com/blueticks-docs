// Bridges the playground Body panel (which stages a chosen file) and the
// createAPIPage fetch hook (which rewrites the outgoing request to
// multipart/form-data when a file is staged). A module-level singleton is fine:
// the browser bundle has one instance, shared by both call sites.
//
// Why a fetch hook instead of a separate "Send file" button: the playground's
// own Send always encodes the body as the operation's preferred media type
// (application/json). `onRequestInit` is the supported seam to swap that body
// for a multipart FormData right before fetch — so the *regular* Send uploads
// the file.
//
// The staged file carries its own field config (which multipart part name to
// use, which JSON fields to drop) so a single rewrite works across endpoints
// with different field names (e.g. messages `mediaFile`/`mediaBase64` vs group
// picture `file`/`file_data_url`).

export interface StagedFile {
  file: File;
  /** Multipart part name the server reads the file from. */
  fileField: string;
  /** JSON body fields to omit from the form (the inline-base64 field + the
   *  file field itself). */
  excludeFields: string[];
}

let staged: StagedFile | null = null;

export const stagedUpload = {
  set(value: StagedFile | null): void {
    staged = value;
  },
  get(): StagedFile | null {
    return staged;
  },
  clear(): void {
    staged = null;
  },
};

/**
 * Build an `onRequestInit` hook for createAPIPage's
 * `client.playground.fetchOptions`. When a file is staged it rewrites the
 * outgoing request to multipart/form-data: every scalar body field (minus the
 * staged `excludeFields`) becomes a form field, the file is appended under the
 * staged `fileField`, and the JSON Content-Type is dropped so the browser sets
 * the multipart boundary. Endpoint-agnostic — the field config travels with the
 * staged file, so one instance serves every media operation.
 */
export function createMultipartRewrite() {
  return async (init: RequestInit): Promise<RequestInit> => {
    const current = stagedUpload.get();
    if (!current) return init;

    let body: Record<string, unknown> | null = null;
    try {
      body = typeof init.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : null;
    } catch {
      body = null;
    }
    if (!body || typeof body !== 'object') return init;

    const form = new FormData();
    for (const [key, value] of Object.entries(body)) {
      if (value == null || value === '' || current.excludeFields.includes(key)) continue;
      form.append(key, typeof value === 'string' ? value : JSON.stringify(value));
    }
    form.append(current.fileField, current.file);

    const headers = new Headers(init.headers as HeadersInit);
    headers.delete('content-type'); // let the browser set the multipart boundary

    return { ...init, headers, body: form };
  };
}
