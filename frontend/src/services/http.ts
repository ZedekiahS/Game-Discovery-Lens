import { API_BASE_URL } from "./runtime";

export class ApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

export async function requestApi<T>(path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  let timedOut = false;
  const cancel = () => controller.abort();
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, 30_000);
  init?.signal?.addEventListener("abort", cancel, { once: true });
  if (init?.signal?.aborted) cancel();
  try {
    const response = await fetch(`${API_BASE_URL}${path}`, { ...init, signal: controller.signal });
    if (!response.ok) {
      let message = `API request failed (${response.status}).`;
      try {
        const body = (await response.json()) as { detail?: unknown };
        if (typeof body.detail === "string") message = body.detail;
      } catch {
        if (controller.signal.aborted) throw new Error("Request aborted");
        // Some network intermediaries return an empty body or HTML error page.
      }
      throw new ApiError(response.status, message);
    }
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (timedOut) throw new ApiError(0, "The request timed out. Reload to check the latest state before trying again.");
    throw new ApiError(0, "Cannot reach the API. Check the connection and try again.");
  } finally {
    clearTimeout(timer);
    init?.signal?.removeEventListener("abort", cancel);
  }
}
