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

const elements = {
	activateAutomaticallyInput: document.getElementById("activateAutomatically"),
	hideSeenLinksAutomaticallyInput: document.getElementById("hideSeenLinksAutomatically"),
	useBrowserHistoryInput: document.getElementById("useBrowserHistory"),
	useExtensionHistoryInput: document.getElementById("useExtensionHistory"),
	trackSeparatelyInput: document.getElementById("trackSeparately"),
	markSeenOnClickInput: document.getElementById("markSeenOnClick"),
	markSeenOnHoverInput: document.getElementById("markSeenOnHover"),
	markSeenOnFocusInput: document.getElementById("markSeenOnFocus"),
	markAllSeenOnUnloadInput: document.getElementById("markAllSeenOnUnload"),
	globalStyleInput: document.getElementById("globalStyle"),
	pageActionCommandInput: document.getElementById("pageActionCommand"),
	pageActionMiddleClickCommandInput: document.getElementById("pageActionMiddleClickCommand"),
};

const BackgroundPort = (() => {
	const port = browser.runtime.connect({ name: "options" });
	const pendingPromises = [ ];

	if (port instanceof Object) {
		port.onMessage.addListener(messageReceived);
	}

	function messageReceived(message) {
		if (message.hasOwnProperty('options')) {
			pendingPromises.map(resolve => resolve(message));
			pendingPromises.length = 0;
			return;
		}

		console.log("Unhandled port message: ", message);
	}

	function getConfigOptions() {
		if (port instanceof Object) {
			port.postMessage({ command: "getConfigOptions", });
			return new Promise((resolve, reject) => pendingPromises.push(resolve));
		}

		return Promise.reject("Port not connected.");
	}

	function notifyOptionChanged(option, value) {
		port.postMessage({ command: "optionChanged", args: [ option, value ], });
	}

	return {
		getConfigOptions: getConfigOptions,
		notifyOptionChanged: notifyOptionChanged,
	};
})();

(async () => {
	const { options, availableCommands } = await BackgroundPort.getConfigOptions();
	restoreOptions();
	addListeners();

	function restoreOptions() {
		if (!options.activateAutomatically) {
			elements.activateAutomaticallyInput.checked = false;
		}

		if (options.hideSeenLinksAutomatically) {
			elements.hideSeenLinksAutomaticallyInput.checked = true;
		}

		if (options.historyProvider == "browser") {
			elements.useBrowserHistoryInput.checked = true;
		}

		if (options.trackSeparately) {
			elements.trackSeparatelyInput.checked = true;
		}

		if (options.markSeenOn == "hover") {
			elements.markSeenOnHoverInput.checked = true;
		}

		if (options.markSeenOnFocus) {
			elements.markSeenOnFocusInput.checked = true;
		}

		if (options.markAllSeenOnUnload) {
			elements.markAllSeenOnUnloadInput.checked = true;
		}

		for (let command of availableCommands) {
			elements.pageActionCommandInput.appendChild(new OptionElement(command.id, command.caption, options.pageActionCommand == command.id));
			elements.pageActionMiddleClickCommandInput.appendChild(new OptionElement(command.id, command.caption, options.pageActionMiddleClickCommand == command.id));
		}

		elements.globalStyleInput.value = options.globalStyle;
	}

	function addListeners() {
		elements.useBrowserHistoryInput.addEventListener("click", requestHistoryPermission);
		elements.activateAutomaticallyInput.addEventListener("change", optionChanged);
		elements.hideSeenLinksAutomaticallyInput.addEventListener("change", optionChanged);
		elements.useBrowserHistoryInput.addEventListener("change", optionChanged);
		elements.useExtensionHistoryInput.addEventListener("change", optionChanged);
		elements.trackSeparatelyInput.addEventListener("change", optionChanged);
		elements.markSeenOnClickInput.addEventListener("change", optionChanged);
		elements.markSeenOnHoverInput.addEventListener("change", optionChanged);
		elements.markSeenOnFocusInput.addEventListener("change", optionChanged);
		elements.markAllSeenOnUnloadInput.addEventListener("change", optionChanged);
		elements.globalStyleInput.addEventListener("change", optionChanged);
		elements.pageActionCommandInput.addEventListener("change", optionChanged);
		elements.pageActionMiddleClickCommandInput.addEventListener("change", optionChanged);
	}

	function requestHistoryPermission(event) {
		browser.permissions.request({ permissions: ["history"] })
		.then(granted => {
			if (granted) {
				document.getElementById("useBrowserHistory").checked = true;
				saveOption("historyProvider", "browser");
			}
			else {
				document.getElementById("useExtensionHistory").checked = true;
				saveOption("historyProvider", "indexedDB");
			}
		});
	}

	function optionChanged(event) {
		let option, value;

		switch(event.target.id) {
			case "useBrowserHistory":
				return;
			case "useExtensionHistory":
				option = "historyProvider";
				break;
			case "markSeenOnClick":
			case "markSeenOnHover":
				option = "markSeenOn";
				break;
			default:
				option = event.target.id;
		}

		if (event.target.nodeName == "INPUT" && event.target.type == "checkbox") {
			value = event.target.checked;
		}
		else {
			value = event.target.value;
		}

		BackgroundPort.notifyOptionChanged(option, value);
	}
})();

function OptionElement(id, caption, selected) {
	const option = document.createElement("option");
	option.value = id;
	option.appendChild(document.createTextNode(caption));

	if (selected) {
		option.selected = true;
	}

	return option;
}
