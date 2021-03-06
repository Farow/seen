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
	useBrowserHistoryInput: document.getElementById("useBrowserHistory"),
	useExtensionHistoryInput: document.getElementById("useExtensionHistory"),
	trackSeparatelyInput: document.getElementById("trackSeparately"),
	markSeenOnClickInput: document.getElementById("markSeenOnClick"),
	markSeenOnHoverInput: document.getElementById("markSeenOnHover"),
	markAllSeenOnUnloadInput: document.getElementById("markAllSeenOnUnload"),
	globalStyleInput: document.getElementById("globalStyle"),
};

let config = { };
getConfig().then(restoreOptions).then(addListeners);

function restoreOptions() {
	if (!config.activateAutomatically) {
		elements.activateAutomaticallyInput.checked = false;
	}

	if (config.historyProvider == "browser") {
		elements.useBrowserHistoryInput.checked = true;
	}

	if (config.trackSeparately) {
		elements.trackSeparatelyInput.checked = true;
	}

	if (config.markSeenOn == "hover") {
		elements.markSeenOnHoverInput.checked = true;
	}

	if (config.markAllSeenOnUnload) {
		elements.markAllSeenOnUnloadInput.checked = true;
	}

	elements.globalStyleInput.value = config.globalStyle;
}

function addListeners() {
	elements.useBrowserHistoryInput.addEventListener("click", requestHistoryPermission);
	elements.activateAutomaticallyInput.addEventListener("change", optionChanged);
	elements.useBrowserHistoryInput.addEventListener("change", optionChanged);
	elements.useExtensionHistoryInput.addEventListener("change", optionChanged);
	elements.trackSeparatelyInput.addEventListener("change", optionChanged);
	elements.markSeenOnClickInput.addEventListener("change", optionChanged);
	elements.markSeenOnHoverInput.addEventListener("change", optionChanged);
	elements.markAllSeenOnUnloadInput.addEventListener("change", optionChanged);
	elements.globalStyleInput.addEventListener("change", optionChanged);
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

	saveOption(option, value);
}

function saveOption(option, value) {
	let saveObject = { };
	saveObject[option] = value;
	browser.storage.sync.set(saveObject)
	.catch(error => console.warn("Could not save option: ", option, error));

	browser.runtime.sendMessage({ command: "configChanged", option: option, value: value });
}

function getConfig() {
	return browser.runtime.sendMessage({ command: "getConfig" }).then(configRetrieved, configError);
}

function configRetrieved(storedConfig) {
	config = storedConfig.options;
}

function configError(error) {
	console.error(`Could not retrieve config: ${ error }`);
	config = defaultConfig();
}

function defaultConfig() {
	return {
		activateAutomatically: true,
		historyProvider: "indexedDB",
		trackSeparately: false,
		markSeenOn: "click",
		markAllSeenOnUnload: false,
	};
}

async function requestHistoryPermission(event) {
	browser.permissions.request({ permissions: ["history"] }).then(granted => {
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
