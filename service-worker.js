import {closePosting, trackerOrigin} from "./src/api.js";
import {createActionController} from "./src/action.js";

const controller = createActionController(chrome, (url) => closePosting(url, {
  origin: trackerOrigin(chrome.runtime.getManifest()),
}));

// Register synchronously so Chrome can wake the worker for these events.
chrome.action.onClicked.addListener(controller.onClicked);
chrome.tabs.onUpdated.addListener(controller.onUpdated);
chrome.tabs.onRemoved.addListener(controller.onRemoved);
