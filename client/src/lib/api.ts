/** Centralized backend API client for TutIn server endpoints. */

const envBase = import.meta.env?.["VITE_API_BASE_URL"];
export const API_BASE_URL = typeof envBase === "string" ? envBase.replace(/\/$/, "") : "";

export function apiUrl(path: string): string {
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE_URL}${normalized}`;
}

export async function apiRequest<T = unknown>(
  path: string,
  options?: RequestInit,
): Promise<{
  ok: boolean;
  status: number;
  data: T | null;
  error?: string | undefined;
  aborted?: boolean | undefined;
}> {
  let res: Response;
  try {
    res = await fetch(apiUrl(path), options);
  } catch (err) {
    const isAborted =
      options?.signal?.aborted === true ||
      (err instanceof DOMException && err.name === "AbortError") ||
      (err instanceof Error && err.name === "AbortError");
    return {
      ok: false,
      status: 0,
      data: null,
      error: isAborted ? "Aborted" : err instanceof Error ? err.message : "Network request failed",
      aborted: isAborted,
    };
  }
  let data: T | null = null;
  try {
    data = (await res.json()) as T;
  } catch {
    data = null;
  }
  if (options?.signal?.aborted) {
    return { ok: false, status: res.status, data: null, error: "Aborted", aborted: true };
  }
  const errorMessage = !res.ok
    ? data &&
      typeof data === "object" &&
      "error" in data &&
      typeof (data as { error?: unknown }).error === "string"
      ? (data as { error: string }).error
      : `HTTP ${res.status}`
    : undefined;
  return { ok: res.ok, status: res.status, data, error: errorMessage };
}

export async function apiJson<T = unknown>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(apiUrl(path), options);
  if (!res.ok) {
    throw new Error(`API error (${res.status}) for ${path}`);
  }
  return (await res.json()) as T;
}
