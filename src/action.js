import {isPostingUrl} from "./api.js";

export const DEFAULT_TITLE = "Mark posting closed in Job Tracker";

export function createActionController(chromeApi, closePosting) {
  const tabs = new Map();
  const inFlight = new Map();
  const feedbackQueues = new Map();

  function feedback(tabId, token, text, title, color = "#475569") {
    // Serialize updates so navigation can clear a slow badge/title operation.
    const previous = feedbackQueues.get(tabId) || Promise.resolve();
    const next = previous.then(async () => {
      if (tabs.get(tabId) !== token) return;
      await Promise.allSettled([
        chromeApi.action.setBadgeText({tabId, text}),
        chromeApi.action.setBadgeBackgroundColor({tabId, color}),
        chromeApi.action.setTitle({tabId, title}),
      ]);
    }).catch(() => {
      // A closed tab has no toolbar to update; the API request still completes.
    });
    feedbackQueues.set(tabId, next);
    void next.then(() => {
      if (feedbackQueues.get(tabId) === next) feedbackQueues.delete(tabId);
    });
    return next;
  }

  function reset(tabId) {
    tabs.delete(tabId);
    return feedback(tabId, undefined, "", DEFAULT_TITLE);
  }

  async function onClicked(tab) {
    if (!Number.isInteger(tab?.id) || tab.id < 0) return;
    const tabId = tab.id;
    const url = tab.url;
    const token = {};
    tabs.set(tabId, token);
    if (!isPostingUrl(url)) {
      await feedback(tabId, token, "ERR", "Open a tracked HTTP(S) posting first (URL limit: 1024 characters).", "#b91c1c");
      return;
    }
    if (tab.status === "loading" || tab.pendingUrl) {
      await feedback(tabId, token, "ERR", "Wait for the posting to finish loading, then click again.", "#b91c1c");
      return;
    }

    const working = feedback(tabId, token, "...", "Updating this posting in Job Tracker…");
    let request = inFlight.get(url);
    if (!request) {
      request = Promise.resolve().then(() => closePosting(url));
      inFlight.set(url, request);
    }
    let result;
    let failure;
    try {
      result = await request;
    } catch (error) {
      failure = error?.message || "Update failed. Check Job Tracker before retrying.";
    } finally {
      if (inFlight.get(url) === request) inFlight.delete(url);
    }
    await working;
    if (tabs.get(tabId) !== token) return;
    try {
      const current = await chromeApi.tabs.get(tabId);
      if (tabs.get(tabId) !== token) return;
      if (current.url !== url || current.pendingUrl || current.status === "loading") {
        await reset(tabId);
        return;
      }
    } catch {
      if (tabs.get(tabId) === token) tabs.delete(tabId);
      return;
    }
    if (failure) {
      await feedback(tabId, token, "ERR", failure, "#b91c1c");
    } else {
      const label = result.changed ? "Posting Closed" : "Already Posting Closed";
      await feedback(tabId, token, "DONE",
        `${label}: #${result.id} — ${result.company} — ${result.role_title}`, "#15803d");
    }
  }

  function onUpdated(tabId, changeInfo) {
    if (changeInfo.status === "loading" || changeInfo.url !== undefined) {
      return reset(tabId);
    }
  }

  function onRemoved(tabId) {
    tabs.delete(tabId);
  }

  return {onClicked, onUpdated, onRemoved};
}
