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

(() => {
	const commands = {
		"getConfig": commandGetConfig,
		"configChanged": commandConfigChanged,
		"getSiteConfig": commandGetSiteConfig,
		"checkSeen": commandCheckSeen,
		"setSeen": commandSetSeen,
		"unload": commandUnload,
	};

	const grantedPermissions = { };
	let activeTab = null;
	const activeTabs = { };
	const ports = [ ];

	/* await for Config and grantedPermissions */
	Promise.all([
		browser.permissions.getAll().then(permissions => Object.assign(grantedPermissions, permissions)),
		Config.ready().catch(error => console.error("Config error: ", error)),
	])
	.then(init);

	function init() {
		for (const origin of grantedPermissions.origins) {
			registerContentScript(origin);
		}

		History.addListener(notifySeenUrl);

		browser.runtime.onConnect.addListener(portConnected);
		browser.runtime.onMessage.addListener(messageReceived);
		browser.pageAction.onClicked.addListener(actionClick);
	}

	function portConnected(port) {
		ports.push(port);
		/*
			No content script sends messages with ports at the moment.
			TODO: use port for unload?
		*/
		//port.onMessage.addListener((message) => {  });
		port.onDisconnect.addListener(portDisconnected);
	}

	function portDisconnected(port) {
		const portIndex = ports.indexOf(port);
		if (portIndex != -1) {
			ports.splice(portIndex, 1);
		}
	}

	function registerContentScript(origin) {
		/*
			Note: The content script seems to only get injected after a page reload,
			in contrast to using the manifest when they're added when the extension is loaded.
		*/

		browser.contentScripts.register({
			matches: [ origin ],
			js: [{ file: "/js/content.js" }],
			runAt: "document_start"
		})
		.catch(error => console.warn("Could not register content script: ", origin, error));
	}

	function messageReceived(message, sender, sendResponse) {
		const hostname = new URL(sender.url).hostname;
		let output = false;

		try {
			const commandHandler = commands[message.command];

			if (commandHandler instanceof Function) {
				return commandHandler(sender, hostname, message);
			}
		}
		catch (ex) {
			console.error("Error while executing command: ", ex);
			return Promise.reject(ex);
		}

		console.warn("Unknown command: ", message);
		return Promise.reject(new Error("Command not defined."));
	}

	function commandGetConfig(sender, hostname, message) {
		return Promise.resolve({ options: Config.options, sites: Config.sites });
	}

	function commandConfigChanged(sender, hostname, message) {
		if (message.option == "historyProvider") {
			History.setProvider(message.value);
		}

		Config.options[message.option] = message.value;
		notifyConfigChanged(message);
	}

	function commandGetSiteConfig(sender, hostname, message) {
		setContentScriptLoaded(sender.tab.id);
		return Promise.resolve(Config.getSiteConfig(hostname));
	}

	function commandCheckSeen(sender, hostname, message) {
		return Config.checkSeen(message.url, message.hostname);
	}

	function commandSetSeen(sender, hostname, message) {
		return Config.setSeen(message.url, message.hostname);
	}

	function commandUnload(sender, hostname, message) {
		/* sender.tab can be null if it's closed. */
		if (sender.tab == null) {
			return false;
		}

		return setContentScriptUnloaded(sender.tab.id);
	}

	function notifySeenUrl(result, url, hostname) {
		/*
			Since we don't have the tabs permission we cannot use browser.tabs.sendMessage outside of messageReceived,
			even if we know the tab id. We can instead use Port.postMessage when a new url is marked as seen.
		*/

		for (let port of ports) {
			port.postMessage({ command: "seenUrl", url: url, hostname: hostname });
		}
	}

	function notifyConfigChanged(message) {
		for (let port of ports) {
			port.postMessage(message);
		}
	}

	function notifyAction() {
		for (let port of ports) {
			if (port.sender.tab.id == activeTabId) {
				port.postMessage({ command: "pageAction" });
				return;
			}
		}
	}

	function actionClick(tab, clickData) {
		/* handle middle click */
		if (clickData.button == 1) {
			browser.runtime.openOptionsPage();
			return;
		}

		const hostname = new URL(tab.url).hostname;

		if (contentScriptInjected(tab.id)) {
			notifyAction();
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

	function contentScriptInjected(tabId) {
		activeTabId = tabId;
		return activeTabs[tabId] != null;
	}

	function setContentScriptLoaded(tabId) {
		activeTabs[tabId] = ((...args) => notifySeenUrl(...args));
		History.addListener(activeTabs[tabId]);
	}

	function setContentScriptUnloaded(tabId) {
		History.removeListener(activeTabs[tabId]);
		delete activeTabs[tabId];
	}
})();
