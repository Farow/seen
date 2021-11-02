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

const ContentScriptPorts = (() => {
	const ports = [ ];

	function add(port) {
		ports.push(new ContentScriptPort(port));
	}

	function containsTab(tabId) {
		return ports.some(c => c.tabId == tabId);
	}

	function notifyAll(message) {
		ports.map(c => c.notify(message));
	}

	function notifyTab(tabId, message) {
		const contentScript = ports.find(c => c.tabId == tabId);

		if (!(contentScript instanceof Object)) {
			console.error("Could not find content script with tab.id: ", tabId);
			return;
		}

		contentScript.notify(message);
	}

	function remove(port) {
		const index = ports.findIndex(c => c.tabId == port.sender.tab.id);

		if (index < 0) {
			console.warn("Port has not been added.");
			return
		}

		ports.splice(index, 1);
	}

	return {
		add: add,
		containsTab: containsTab,
		notifyAll: notifyAll,
		notifyTab: notifyTab,
		remove: remove,
	};
})();

/* await for grantedPermissions and Config */
Promise.all([
	browser.permissions.getAll(),
	Config.ready().catch(error => console.error("Config error: ", error)),
])
.then(init);

function init(result) {
	const grantedPermissions = result[0];

	for (const origin of grantedPermissions.origins) {
		registerContentScript(origin);
	}

	browser.runtime.onConnect.addListener(portConnected);
	browser.pageAction.onClicked.addListener(actionClick);
}

function registerContentScript(origin) {
	/*
		Note: The content script seems to only get injected after a page reload,
		in contrast to using the manifest when they are added as soon as the extension is loaded.
	*/

	browser.contentScripts.register({
		matches: [ origin ],
		js: [{ file: "/js/content.js" }],
		runAt: "document_start"
	})
	.catch(error => console.warn("Could not register content script: ", origin, error));
}

function portConnected(port) {
	switch (port.name) {
		case "contentToBackground":
			ContentScriptPorts.add(port);
			break;

		case "options":
			new OptionsPort(port, onOptionChanged);
			break;

		default:
			console.warn("Unknown port connection:", port);
	}
}

function onOptionChanged(option, value) {
	if (option == "historyProvider") {
		History.setProvider(value);
	}

	Config.options[option] = value;
	ContentScriptPorts.notifyAll({ command: "optionChanged", args: [ option, value], });
}

function actionClick(tab, clickData) {
	/* handle middle click */
	if (clickData.button == 1) {
		browser.runtime.openOptionsPage();
		return;
	}

	const hostname = new URL(tab.url).hostname;

	if (ContentScriptPorts.containsTab(tab.id)) {
		ContentScriptPorts.notifyTab(tab.id, { command: "pageAction" });
		return;
	}

	if (Config.getSiteConfig(hostname).isSupported) {
		if (Config.options.activateAutomatically) {
			browser.permissions.request({ origins: [ `*://${ hostname }/*` ] })
			.then(granted => {
				if (granted) {
					registerContentScript(`*://${ hostname }/*`);
				}
			});
		}
	}
	else {
		browser.pageAction.hide(tab.id);
	}

	browser.tabs.executeScript(tab.id, { file: "/js/content.js" });
}

function ContentScriptPort(port) {
	const hostname = new URL(port.sender.tab.url).hostname;

	port.onMessage.addListener(messageReceived);
	port.onDisconnect.addListener(portDisconnected);
	History.addListener(onHistoryAdded);

	/* public methods */
	function notify(message) {
		try {
			port.postMessage(message);
		}
		catch (error) {
			console.error(error);
		}
	}

	/* private methods */
	function onHistoryAdded(...args) {
		notify({ command: "seenUrl", args: args });
	}

	function messageReceived(message) {
		if (message.hasOwnProperty("id") && message.hasOwnProperty("data")) {
			handleMessage(message.data)
			.then(result => {
				port.postMessage({ id: message.id, data: result });
			})
			.catch(error => {
				/* error is casted to a string so it can be cloned. */
				port.postMessage({ id: message.id, error: error + "", });
			});
		}
		else {
			console.warn("Content scripts should include a message id and a data parameter.");
		}
	}

	function handleMessage(message) {
		if (!message.hasOwnProperty("command")) {
			return Promise.reject("No command specified.");
		}

		const args = message.hasOwnProperty("args") ? message.args : [ ];

		switch (message.command) {
			case "getSiteConfig":
				return onGetSiteConfig(...args);

			case "checkSeen":
				return onCheckSeen(...args);

			case "setSeen":
				return onSetSeen(...args);

			case "unload":
				return onUnload(...args);

			default:
				console.warn("Unhandled command:", message.command);
				return Promise.reject("Unknown command: " + message.command);
		}
	}

	function onGetSiteConfig() {
		return Promise.resolve(Config.getSiteConfig(hostname));
	}

	function onCheckSeen(url) {
		return Config.checkSeen(url, hostname);
	}

	function onSetSeen(url) {
		return Config.setSeen(url, hostname);
	}

	function onUnload(urls) {
		for (const url of urls) {
			Config.setSeen(url, hostname);
		}

		return Promise.resolve(true);
	}

	function portDisconnected() {
		ContentScriptPorts.remove(port);
		History.removeListener(onHistoryAdded);
	}

	return {
		tabId: port.sender.tab.id,
		notify: notify,
	};
}

function OptionsPort(port, optionChangedListener) {
	port.onMessage.addListener(messageReceived);
	port.onDisconnect.addListener(portDisconnected);

	function messageReceived(message) {
		if (!message.hasOwnProperty('command')) {
			console.warn("Unknown options message:", message);
			return;
		}

		const args = message.hasOwnProperty('args') ? message.args : [ ];

		switch (message.command) {
			case "getConfigOptions":
				port.postMessage({ options: Config.options, });
				break;

			case "optionChanged":
				onOptionChanged(...args);
				break;

			default:
				console.warn("Unknown options command:", message.command);
		}
	}

	function onOptionChanged(option, value) {
		if (optionChangedListener instanceof Function) {
			optionChangedListener(option, value);
		}
	}

	function portDisconnected() {
		port = null;
		optionChangedListener = null;
	}
}
