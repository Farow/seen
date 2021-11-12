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

	browser.menus.create({
		id: "toggleVisibility",
		contexts: ["page_action"],
		title: "Toogle visibility",
	});

	browser.menus.create({
		id: "markAllSeen",
		contexts: ["page_action"],
		title: "Mark all as seen",
	});

	browser.menus.create({
		id: "markAllNew",
		contexts: ["page_action"],
		title: "Mark all as new",
	});

	browser.menus.create({
		id: "clearHistory",
		contexts: ["page_action"],
		title: "Clear history",
	});

	browser.menus.create({
		id: "openOptionsPage",
		contexts: ["page_action"],
		title: "Open options page",
	});

	browser.menus.onShown.addListener(onMenuShown);
	browser.menus.onClicked.addListener(onMenuClick);
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

function onMenuShown(info, tab) {
	const contentScriptLoaded = ContentScriptPorts.containsTab(tab.id);
	const contentScriptMenuItems = ["toggleVisibility", "markAllSeen", "markAllNew"];

	for (const menuId of contentScriptMenuItems) {
		browser.menus.update(menuId, { enabled: contentScriptLoaded });
	}

	browser.menus.refresh();
}

function onMenuClick(info, tab) {
	switch (info.menuItemId) {
		case "clearHistory":
			onClearHistory();
			break;

		case "markAllNew":
		case "markAllSeen":
		case "toggleVisibility":
			ContentScriptPorts.notifyTab(tab.id, { command: info.menuItemId });
			break;

		case "openOptionsPage":
			openOptionsPage();
			break;

		default:
			console.warn("Unhandled menu item click:", info);
	}
}

function onClearHistory() {
	Config.clearHistory()
	.then(result => ContentScriptPorts.notifyAll({ command: "clearHistory" }))
	.catch(error => console.error("Error while clearing history:", error));
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
	const actionCommand = clickData == null || clickData.button == 0
		? Config.options.pageActionCommand
		: Config.options.pageActionMiddleClickCommand;


	/* handle middle click */
	if (clickData != null && clickData.button == 1) {
		const canExecuteCommand = ContentScriptPorts.containsTab(tab.id) || ["clearHistory", "openOptionsPage"].indexOf(actionCommand) > -1;

		if (canExecuteCommand) {
			onMenuClick({ menuItemId: actionCommand }, tab);
		}
		else {
			console.warn("Cannot perform pageActionMiddleClickCommand:", actionCommand);
		}

		return;
	}

	if (ContentScriptPorts.containsTab(tab.id)) {
		onMenuClick({ menuItemId: actionCommand }, tab);
		return;
	}

	executeContentScript(tab);
}

function executeContentScript(tab) {
	const hostname = new URL(tab.url).hostname;

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

function openOptionsPage() {
	browser.runtime.openOptionsPage();
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

			case "setNew":
				return onSetNew(...args);

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

	function onSetNew(url) {
		return Config.setNew(url, hostname);
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
			case "getConfig":
				port.postMessage({
					availableCommands: [
						{ id: "clearHistory", caption: "Clear history" },
						{ id: "markAllNew", caption: "Mark all as new" },
						{ id: "markAllSeen", caption: "Mark all as seen" },
						{ id: "openOptionsPage", caption: "Open options page" },
						{ id: "toggleVisibility", caption: "Toogle visibility" },
					],

					// A proxy object cannot be directly cloned.
					options: Object.assign({}, Config.options),
				});
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
