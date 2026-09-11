export function isPostingUrl(value) {
  if (typeof value !== "string" || !value || value.length > 1024) return false;
  try {
    return ["http:", "https:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

// The manifest is the single configuration source for the tracker origin.
export function trackerOrigin(manifest) {
  const hosts = manifest.host_permissions;
  if (hosts?.length !== 1 || !/^https?:\/\/[^/*]+\/\*$/.test(hosts[0])) {
    throw new Error("Configure exactly one tracker origin in manifest.json.");
  }
  return new URL(hosts[0].slice(0, -1)).origin;
}

function detailMessage(detail) {
  if (typeof detail === "string") return detail;
  if (!Array.isArray(detail)) return null;
  return detail.map((item) => {
    const field = Array.isArray(item.loc)
      ? item.loc.filter((part) => part !== "body").join(".") : "";
    return `${field ? `${field}: ` : ""}${item.msg || "Invalid value"}`;
  }).join("; ");
}

export async function closePosting(jobLink, {
  origin, fetchImpl = fetch, timeoutMs = 12_000,
} = {}) {
  if (!isPostingUrl(jobLink)) {
    throw new Error("Open a tracked HTTP(S) posting first (URL limit: 1024 characters).");
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(`${origin}/api/applications/by-url/status`, {
      method: "PATCH",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({job_link: jobLink, status: "posting_closed"}),
      signal: controller.signal,
      redirect: "error",
    });
    let body;
    try {
      body = await response.json();
    } catch (error) {
      if (controller.signal.aborted) throw error;
      // HTML proxy errors and incomplete responses must never appear successful.
    }
    if (!response.ok) {
      const detail = detailMessage(body?.detail);
      if (response.status >= 500) {
        throw new Error(`Job Tracker error (${response.status}). Result unknown; check the tracker or retry.`);
      }
      if (response.status === 404 && (!detail || detail === "Not Found")) {
        throw new Error("Closure endpoint not found. Deploy the updated Job Tracker backend first.");
      }
      throw new Error(detail || `Job Tracker request failed (${response.status}).`);
    }
    if (!Number.isInteger(body?.id) || body.id <= 0 ||
        typeof body.company !== "string" || typeof body.role_title !== "string" ||
        body.job_link !== jobLink || body.status !== "posting_closed" ||
        typeof body.changed !== "boolean") {
      throw new Error("Unexpected Job Tracker response. Result unknown; check the tracker or retry.");
    }
    return body;
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error("Job Tracker timed out. Result unknown; check the tracker or click again to retry.");
    }
    if (error instanceof TypeError) {
      throw new Error("Could not reach Job Tracker. Check the home LAN and server. Result unknown; retry when connected.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
