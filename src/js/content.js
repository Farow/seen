/**
 * Seen - a browser extension to fade or hide seen links.
 * Copyright (C) 2021-present Farow
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

(async () => {
	const site = await browser.runtime.sendMessage({ command: "getSiteConfig" });

	if (!site.isSupported) {
		notifyUnload();
		alert("This site is not supported.");
		return;
	}

	if (window.seen) {
		alert("The content script has already been loaded.");
		return;
	}

	window.seen = true;

	const listeners = [ ];
	const findParents = createFindParentsFunction();

	init();

	function init() {
		const port = browser.runtime.connect({ name: "contentToBackground" });
		port.onMessage.addListener(messageReceived);

		const links = document.querySelectorAll(site.links);
		const checkSeenPromises = [];

		for (let link of links) {
			const promise = checkSeen(link);
			checkSeenPromises.push(promise);
		}

		const observer = new MutationObserver(mutationCallback);
		observer.observe(document, { subtree: true, childList: true });

		/* add the style after every seen link has been marked, in order to apply it on all the links at the same time */
		Promise.all(checkSeenPromises).then(addStyle);
		window.addEventListener("unload", notifyUnload);
	}

	/* TODO: handle removed links */
	function mutationCallback(mutations) {
		for (let mutation of mutations) {
			for (let node of mutation.addedNodes) {
				if (node.nodeType == Node.ELEMENT_NODE) {
					checkForValidLinks(node);
				}
			}
		}
	}

	function checkForValidLinks(element) {
		if (element == null) {
			return;
		}

		if (element.matches(site.links)) {
			checkSeen(element);
		}

		/* don't check for children if still loading */
		if (document.readyState == "loading") {
			return;
		}

		for (let child of element.children) {
			checkForValidLinks(child);
		}
	}

	function createFindParentsFunction() {
		return new Function('link', site.parents);
	}

	function messageReceived(message) {
		switch (message.command) {
			case "seenUrl":
				commandSeenUrl(message);
				break;
			case "configChanged":
				commandConfigChanged(message);
				break;
			case "pageAction":
				commandPageAction();
				break;
			default:
				console.warn("Unknown message: ", message);
		}
	}

	/* Mark seen urls from other tabs. */
	function commandSeenUrl(message) {
		if (site.trackSeparately && message.hostname != site.hostname) {
			return;
		}

		for (let listener of listeners) {
			if (listener.link.href == message.url) {
				removeEventListener(listener.link);
				markSeen(listener.link);
			}
		}
	}

	function commandConfigChanged(message) {
		site[message.option] = message.value;

		/* TODO: handle more cases */
		if (message.option == "markSeenOn") {
			const oldListeners = listeners.splice(0, listeners.length);

			for (let listener of oldListeners) {
				listener.link.removeEventListener(listener.event, listener.callback);
				addEventListener(listener.link);
			}
		}
	}

	function commandPageAction() {
		const links = document.querySelectorAll(site.links);
		let markedHiddenAny = false;

		for (const link of links) {
			if (markHiddenIfSeen(link)) {
				markedHiddenAny = true;
			}
		}

		if (!markedHiddenAny) {
			for (const link of links) {
				unmarkHidden(link);
			}
		}
	}

	function notifyUnload() {
		browser.runtime.sendMessage({ command: "unload" });
	}

	function checkSeen(link) {
		browser.runtime.sendMessage({ command: "checkSeen", url: link.href, hostname: site.hostname })
		.then(visited => {
			if (visited) {
				markSeen(link);
			}
			else {
				markNew(link);
				addEventListener(link);
			}
		})
		.catch(error => console.error("checkSeen error: ", error, link));
	}

	function setSeen(event) {
		// If the link we set a listener on contains a child element, event.target will be that element.
		const link = event.target.closest('a');
		removeEventListener(link);
		browser.runtime.sendMessage({ command: "setSeen", url: link.href, hostname: site.hostname })
		.then(result => markSeen(link))
		.catch(error => console.error("setSeen error: ", error));
	}

	function markSeen(link) {
		addClass(link, "seen");
	}

	function unmarkHidden(link) {
		const parents = findParents(link);

		for (const parent of parents) {
			parent.classList.remove("hidden");
		}
	}

	function markHiddenIfSeen(link) {
		const parents = findParents(link);

		if (!parents[0].classList.contains("seen") || parents[0].classList.contains("hidden")) {
			return false;
		}

		for (const parent of parents) {
			parent.classList.add("hidden");
		}

		return true;
	}

	function addClass(link, className) {
		const parents = findParents(link);

		for (const parent of parents) {
			parent.classList.add(className);
		}
	}

	function markNew(link) {
		const parents = findParents(link);

		for (const parent of parents) {
			parent.classList.add("new");
		}
	}

	function addEventListener(link) {
		if (site.historyProvider == "browser") {
			return;
		}

		const event = site.markSeenOn == "click" ? "mouseup" : "mouseover";
		link.addEventListener(event, setSeen);
		listeners.push({ link: link, event: event, callback: setSeen, });

		if (site.markSeenOnFocus) {
			link.addEventListener("focusin", setSeen);
			listeners.push({ link: link, event: "focusin", callback: setSeen, });
		}
	}

	function removeEventListener(link) {
		var listenerIndex = listeners.findIndex(l => l.link == link);
		var listener = listeners[listenerIndex];

		link.removeEventListener(listener.eventName, listener.callback);
		listeners.splice(listenerIndex, 1);
	}

	function addStyle() {
		if (document.head == null) {
			document.addEventListener("DOMContentLoaded", addStyle);
		}

		const style = createStyleElement();

		style.appendChild(document.createTextNode(site.globalStyle));
		style.appendChild(document.createTextNode(site.style));

		document.head.appendChild(style);
	}

	function createStyleElement() {
		const style = document.createElement("style");
		style.type = "text/css";
		style.id = "seenStylesheet";

		return style;
	}
})();
