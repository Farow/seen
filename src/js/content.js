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

const BackgroundPort = (() => {
	let id = 0;
	let port;
	const awaitingResponse = { };
	const listeners = [ ];

	function addListener(callback) {
		listeners.push(callback);
	}

	function connect() {
		port = browser.runtime.connect({ name: "contentToBackground" });

		if (port instanceof Object) {
			port.onMessage.addListener(messageReceived);
			port.onDisconnect.addListener(portDisconnected);
		}
	}

	function disconnect() {
		port.disconnect();
	}

	function portDisconnected() {
		console.warn("Port disconnected:", port, ...arguments);
	}

	function postMessage(data) {
		return new Promise((resolve, reject) => {
			if (port instanceof Object) {
				awaitingResponse[++id] = { resolve: resolve, reject: reject };
				port.postMessage({ id: id, data: data });
			}
			else {
				reject("Port not connected.");
			}
		});
	}

	function messageReceived(message) {
		/* Handle response. */
		if (message.hasOwnProperty('id') && awaitingResponse.hasOwnProperty(message.id)) {
			const promise = awaitingResponse[message.id];
			delete awaitingResponse[message.id];

			if (message.hasOwnProperty('error')) {
				promise.reject(message.error);
				return;
			}

			promise.resolve(message.data);
			return;
		}

		/* Handle messages with no id. */
		if (message.hasOwnProperty('command')) {
			const args = message.hasOwnProperty('args') ? message.args : [ ];
			for (const listener of listeners) {
				if (listener instanceof Function) {
					listener(message.command, ...args);
				}
			}
		}
	}

	return {
		addListener: addListener,
		connect: connect,
		disconnect: disconnect,
		postMessage: postMessage,
	};
})();

(async () => {
	if (window.seen) {
		alert("The content script has already been loaded.");
		return;
	}

	window.seen = true;

	BackgroundPort.connect();

	const site = await BackgroundPort.postMessage({ command: 'getSiteConfig' });
	if (!site.isSupported) {
		BackgroundPort.disconnect();
		alert("This site is not supported.");
		return;
	}

	const links = [ ];

	init();

	function init() {
		const links = document.querySelectorAll(site.links);
		const checkSeenPromises = [];

		for (const link of links) {
			linkAdded(link);
		}

		const observer = new PageObserver(site.links, linkAdded);
		addStyle();

		BackgroundPort.addListener(onCommand);
		updateUnloadListener();
	}

	function linkAdded(element) {
		var link = new Link(element);
		link.checkSeen();
		links.push(link);
	}

	function onCommand(command, ...args) {
		switch (command) {
			case "clearHistory":
				onClearHistory(...args);
				break;

			case "markAllNew":
				onMarkAllNew(...args);
				break;

			case "markAllSeen":
				onMarkAllSeen(...args);
				break;

			case "optionChanged":
				onOptionChanged(...args);
				break;

			case "seenUrl":
				onSeenUrl(...args);
				break;

			case "toggleStyles":
				onToggleStyles(...args);
				break;

			case "toggleVisibility":
				onToggleVisibility(...args);
				break;

			default:
				console.warn("Unhandled command: ", command);
		}
	}

	function onClearHistory() {
		links.filter(l => !l.isNew).map(l => l.markNew());
	}

	function onMarkAllNew() {
		links.filter(l => !l.isNew).map(l => l.setNew());
	}

	function onMarkAllSeen() {
		links.filter(l => l.isNew).map(l => l.setSeen());
	}

	function onOptionChanged(option, value) {
		site[option] = value;

		switch (option) {
			case "activateAutomatically":
			case "hideSeenLinksAutomatically":
			case "pageActionCommand":
			case "pageActionMiddleClickCommand":
				break;

			case "globalStyle":
				updateGlobalStyle(value);
				break;

			case "historyProvider":
			case "markSeenOn":
			case "markSeenOnFocus":
				links.map(l => l.updateListener());
				break;

			case "markAllSeenOnUnload":
				updateUnloadListener();
				break;

			default:
				console.warn("Unhandled option change:", option);
		}
	}

	/* Mark seen urls from other tabs. */
	function onSeenUrl(url, hostname) {
		if (site.trackSeparately && hostname != site.hostname) {
			return;
		}

		links.filter(l => l.element.href == url).map(l => l.markSeen());
	}

	function onToggleStyles() {
		const style = document.getElementById("seenStylesheet");
		style.disabled = !style.disabled;
	}

	function onToggleVisibility() {
		const anyLinksHidden = links.map(l => l.hideIfSeen()).some(hidden => hidden);

		if (!anyLinksHidden) {
			links.map(l => l.show());
		}
	}

	function updateGlobalStyle(newStyle) {
		const style = document.getElementById("seenStylesheet");
		const newNode = document.createTextNode(newStyle);

		requestAnimationFrame(() => {
			style.firstChild.remove();
			style.insertBefore(newNode, style.firstChild);
		});
	}

	function updateUnloadListener() {
		if (site.markAllSeenOnUnload) {
			window.addEventListener("unload", notifyUnload);
		}
		else {
			window.removeEventListener("unload", notifyUnload);
		}
	}

	function notifyUnload() {
		const newUrls = links.filter(l => l.isNew).map(l => l.element.href);
		BackgroundPort.postMessage({ command: "unload", args: [ newUrls ], });
	}

	function addStyle() {
		if (document.head == null) {
			document.addEventListener("DOMContentLoaded", addStyle);
			return;
		}

		const style = createStyleElement();
		style.appendChild(document.createTextNode(site.globalStyle));
		style.appendChild(document.createTextNode(site.style));

		requestAnimationFrame(() => {
			document.head.appendChild(style);
		});
	}

	function createStyleElement() {
		const style = document.createElement("style");
		style.type = "text/css";
		style.id = "seenStylesheet";

		return style;
	}

	function Link(element) {
		let visited;
		const listeners = [ ];

		/* public methods */
		function checkSeen() {
			return BackgroundPort.postMessage({ command: "checkSeen", args: [ element.href, site.hostname ] })
			.then(result => {
				visited = result;
				if (visited) {
					if (site.hideSeenLinksAutomatically) {
						addClass("seen", "hidden");
					}
					else {
						addClass("seen");
					}
				}
				else {
					addClass("new");
					addEventListener();
				}
			})
			.catch(error => console.error("checkSeen error: ", error, element));
		}

		function hideIfSeen() {
			if (visited && !containsClass("hidden")) {
				addClass("hidden");
				return true;
			}

			return false;
		}

		function markNew() {
			visited = false;
			addClass("new");
			removeClass("seen");
			updateListener();
		}

		function markSeen() {
			visited = true;
			removeEventListener();
			addClass("seen");
		}

		function setNew() {
			BackgroundPort.postMessage({ command: "setNew", args: [ element.href, site.hostname ] })
			.then(result => markNew())
			.catch(error => { addClass("error"); console.error("setNew error: ", error); });
		}

		function setSeen(event) {
			removeEventListener();
			BackgroundPort.postMessage({ command: "setSeen", args: [ element.href, site.hostname ] })
			.then(result => markSeen())
			.catch(error => { addClass("error"); console.error("setSeen error: ", error); });
		}

		function show() {
			removeClass("hidden");
		}

		function updateListener() {
			removeEventListener();

			if (!visited) {
				addEventListener();
			}
		}

		/* private methods */
		function addClass(...classNames) {
			const parents = findParents();

			requestAnimationFrame(() => {
				for (const parent of parents) {
					parent.classList.add(...classNames);
				}
			});
		}

		function addEventListener() {
			if (site.historyProvider == "browser") {
				return;
			}

			const event = site.markSeenOn == "click" ? "mouseup" : "mouseover";
			element.addEventListener(event, setSeen);
			listeners.push({ element: element, event: event, callback: setSeen, });

			if (site.markSeenOnFocus) {
				element.addEventListener("focusin", setSeen);
				listeners.push({ element: element, event: "focusin", callback: setSeen, });
			}
		}

		function containsClass(className) {
			return findParents().some(p => p.classList.contains(className));
		}

		function findParents() {
			const parents = [ element.closest(site.parent) ];

			if (site.hasOwnProperty("parentSiblings")) {
				if (!Number.isInteger(site.parentSiblings) || site.parentSiblings < 1) {
					console.warn("parentSiblings has an invalid value:", site.parentSiblings);
					return parents;
				}

				let i = site.parentSiblings;
				let currentElement = parents[0];

				while (i-- && currentElement.nextElementSibling) {
					currentElement = currentElement.nextElementSibling;
					parents.push(currentElement);
				}

				if (i > 0) {
					console.warn(`Unable to find ${ i } sibling(s) for link:`, element, parents[0]);
				}
			}

			return parents;
		}

		function removeClass(className) {
			const parents = findParents();

			requestAnimationFrame(() => {
				for (const parent of parents) {
					parent.classList.remove(className);
				}
			});
		}

		function removeEventListener() {
			for (const listener of listeners) {
				element.removeEventListener(listener.event, listener.callback);
			}

			listeners.length = 0;
		}

		return {
			get element() { return element; },
			get isNew() { return listeners.length != 0; },
			checkSeen: checkSeen,
			hideIfSeen: hideIfSeen,
			markNew: markNew,
			markSeen: markSeen,
			setNew: setNew,
			setSeen: setSeen,
			show: show,
			updateListener: updateListener,
		};
	}
})();

function PageObserver(query, callback) {
	const observer = new MutationObserver(mutationCallback);
	observer.observe(document, { subtree: true, childList: true });

	/* TODO: handle removed links */
	function mutationCallback(mutations) {
		for (const mutation of mutations) {
			for (const node of mutation.addedNodes) {
				if (node.nodeType == Node.ELEMENT_NODE) {
					checkForValidLinks(node);
				}
			}
		}
	}

	function checkForValidLinks(element) {
		if (element.matches(query) && callback instanceof Function) {
			callback(element);
			return;
		}

		for (const child of element.children) {
			checkForValidLinks(child);
		}
	}
}
