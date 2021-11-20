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
	exportInput: document.getElementById("export"),
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

	function getConfig() {
		if (port instanceof Object) {
			port.postMessage({ command: "getConfig", });
			return new Promise((resolve, reject) => pendingPromises.push(resolve));
		}

		return Promise.reject("Port not connected.");
	}

	function notify(message) {
		try {
			port.postMessage(message);
		}
		catch (error) {
			console.error(error);
		}
	}

	return {
		getConfig: getConfig,
		notify: notify,
	};
})();

(async () => {
	const { availableCommands, options, sites } = await BackgroundPort.getConfig();
	elements.sitesInput = new SitesInput(sites);

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
		document.body.insertBefore(elements.sitesInput.element, elements.exportInput.parentElement);
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
		elements.sitesInput.onSiteHostnameChanged = onSiteHostnameChanged;
		elements.sitesInput.onSiteKeyChanged = onSiteKeyChanged;
		elements.sitesInput.onSiteRemoved = onSiteRemoved;
		elements.exportInput.addEventListener("click", onExport);
	}

	function onSiteHostnameChanged(oldHostname, newHostname) {
		const site = sites[oldHostname];
		delete sites[oldHostname];
		sites[newHostname] = site;
		BackgroundPort.notify({ command: "siteHostnameChanged", args: [ oldHostname, newHostname ] });
	}

	function onSiteKeyChanged(hostname, key, value) {
		sites[hostname][key] = value;
		BackgroundPort.notify({ command: "siteKeyChanged", args: [ hostname, key, value ] });
	}

	function onSiteRemoved(hostname) {
		delete sites[hostname];
		BackgroundPort.notify({ command: "siteRemoved", args: [ hostname ] });
	}

	function onExport() {
		const version = browser.runtime.getManifest().version;
		saveJson(JSON.stringify({ seenVersion: version, options, sites }, null, 4));
	}

	function saveJson(data) {
		const saveHelper = document.createElement("a");
		saveHelper.href = URL.createObjectURL(new Blob([ data ], { type : "application/json" }));
		saveHelper.download = `seen-${ new Date().toISOString().slice(0, 10) }.json`;

		document.body.appendChild(saveHelper);
		saveHelper.click();
		document.body.removeChild(saveHelper);
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

		BackgroundPort.notify({ command: "optionChanged", args: [ option, value ] });
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

function SitesInput(sites) {
	const details = document.createElement("details");
	const summary = document.createElement("summary");

	summary.appendChild(document.createTextNode("Sites"));
	details.appendChild(summary);

	const addSiteButton = document.createElement("button");
	addSiteButton.appendChild(document.createTextNode("Add new site"));
	addSiteButton.classList.add("browser-style", "add-button");
	addSiteButton.addEventListener("click", addSiteButton_onClick);
	details.appendChild(addSiteButton);

	for (const hostname of Object.keys(sites).sort()) {
		const siteDetails = new SiteDetails(hostname, sites[hostname]);
		siteDetails.onSiteHostnameChanged = site_onSiteHostnameChanged;
		siteDetails.onSiteKeyChanged = site_onSiteKeyChanged;
		siteDetails.onSiteRemoved = site_onSiteRemoved;
		details.appendChild(siteDetails.element);
	}

	let onSiteHostnameChanged, onSiteKeyChanged, onSiteRemoved;

	function addSiteButton_onClick(event) {
		const exampleHostname = generateNextExampleHostname();
		const newSite = { links: "" };
		sites[exampleHostname] = newSite;

		const siteDetails = new SiteDetails(exampleHostname, newSite);
		siteDetails.onSiteHostnameChanged = site_onSiteHostnameChanged;
		siteDetails.onSiteKeyChanged = site_onSiteKeyChanged;
		siteDetails.onSiteRemoved = site_onSiteRemoved;
		addSiteButton.insertAdjacentElement("afterend", siteDetails.element);

		site_onSiteKeyChanged(exampleHostname, "links", "");
	}

	function site_onSiteHostnameChanged(oldHostname, newHostname) {
		if (onSiteHostnameChanged instanceof Function) {
			const site = sites[oldHostname];
			delete sites[oldHostname];
			sites[newHostname] = site;
			onSiteHostnameChanged(oldHostname, newHostname);
		}
	}

	function site_onSiteKeyChanged() {
		if (onSiteKeyChanged instanceof Function) {
			onSiteKeyChanged(...arguments);
		}
	}

	function site_onSiteRemoved(hostname, detailsElement) {
		delete sites[hostname];
		details.removeChild(detailsElement);

		if (onSiteRemoved instanceof Function) {
			onSiteRemoved(hostname);
		}
	}

	function contains(hostname) {
		return sites.hasOwnProperty(hostname);
	}

	function generateNextExampleHostname() {
		if (!sites.hasOwnProperty("www.example.com")) {
			return "www.example.com";
		}

		let counter = 1;

		while (sites.hasOwnProperty(counter + ".example.com")) {
			counter++;
		}

		return counter + ".example.com";
	}

	return {
		element: details,
		set onSiteHostnameChanged(callback) { onSiteHostnameChanged = callback },
		set onSiteKeyChanged(callback) { onSiteKeyChanged = callback },
		set onSiteRemoved(callback) { onSiteRemoved = callback },
		contains: contains,
	};
}

function SiteDetails(hostname, options) {
	const details = document.createElement("details");

	const summary = document.createElement("summary");
	summary.appendChild(document.createTextNode(hostname));
	details.appendChild(summary);

	const removeButton = new RemoveButton("Remove");
	removeButton.onClick = removeButton_onClick;
	summary.appendChild(removeButton.element);

	const detailsWrapper = document.createElement("div");
	details.appendChild(detailsWrapper);

	const hostnameInput = new HostnameInput("Hostname", hostname);
	hostnameInput.onChanged = hostname_onChanged;
	detailsWrapper.appendChild(hostnameInput.element);

	const linkInput = new TextInput("Link query", options.links);
	linkInput.onChanged = link_onChanged;
	detailsWrapper.appendChild(linkInput.element);

	const parentInput = new TextInput("Parent query", options.parent);
	parentInput.onChanged = parent_onChanged;
	detailsWrapper.appendChild(parentInput.element);

	const parentSiblingsInput = new ParentSiblingsInput("Parent siblings", options.parentSiblings ?? "");
	parentSiblingsInput.onChanged = parentSiblings_onChanged;
	detailsWrapper.appendChild(parentSiblingsInput.element);

	let onSiteRemoved, onSiteHostnameChanged, onSiteKeyChanged;

	function hostname_onChanged(newHostname) {
		if (onSiteHostnameChanged instanceof Function) {
			onSiteHostnameChanged(hostname, newHostname);
		}
		summary.firstChild.nodeValue = newHostname;
		hostname = newHostname;
	}

	function link_onChanged(newValue) {
		dispatchDetailsChanged(hostname, "links", newValue);
	}

	function parent_onChanged(newValue) {
		dispatchDetailsChanged(hostname, "parent", newValue);
	}

	function parentSiblings_onChanged(newValue) {
		dispatchDetailsChanged(hostname, "parentSiblings", newValue);
	}

	function dispatchDetailsChanged() {
		if (onSiteKeyChanged instanceof Function) {
			onSiteKeyChanged(...arguments);
		}
	}

	function removeButton_onClick() {
		if (onSiteRemoved instanceof Function) {
			onSiteRemoved(hostname, details);
		}
	}

	return {
		element: details,
		set onSiteHostnameChanged(callback) { onSiteHostnameChanged = callback },
		set onSiteKeyChanged(callback) { onSiteKeyChanged = callback },
		set onSiteRemoved(callback) { onSiteRemoved = callback },
	};
}

function RemoveButton(caption, timeout = 3000) {
	const wrapper = document.createElement("div");
	wrapper.classList.add("remove-button");

	const removeWarning = document.createElement("span");
	removeWarning.appendChild(document.createTextNode("Click again to confirm"));
	removeWarning.classList.add("warning");
	wrapper.appendChild(removeWarning);

	const button = document.createElement("button");
	button.classList.add("browser-style", "remove-button");
	button.appendChild(document.createTextNode(caption));
	button.addEventListener("click", button_onClick);
	wrapper.appendChild(button);

	let timeoutId, onClick;

	function button_onClick(event) {
		if (wrapper.classList.contains("confirm")) {
			clearTimeout(timeoutId);
			resetButton();

			if (onClick instanceof Function) {
				onClick();
			}

			return;
		}

		wrapper.classList.add("confirm");
		timeoutId = setTimeout(resetButton, timeout)
	}

	function resetButton() {
		wrapper.classList.remove("confirm");
	}

	return {
		element: wrapper,
		set onClick(callback) { onClick = callback },
	};
}

function HostnameInput(caption, hostname) {
	const textInput = new TextInput(caption, hostname);
	textInput.onChanged = onTextInputChanged;

	let onChanged;

	function onTextInputChanged(newHostname) {
		if (newHostname == hostname) {
			textInput.error = "";
			return;
		}

		if (newHostname.length == 0) {
			textInput.error = "Hostname cannot be empty.";
			return;
		}

		if (elements.sitesInput.contains(newHostname)) {
			textInput.error = "Hostname already exists.";
			return;
		}

		hostname = newHostname;
		textInput.error = "";

		if (onChanged instanceof Function) {
			onChanged(newHostname);
		}
	}

	return {
		element: textInput.element,
		set onChanged(callback) { onChanged = callback },
	};
}

function TextInput(caption, value) {
	const label = document.createElement("label");
	label.classList.add("browser-style");

	const span = document.createElement("span");
	span.appendChild(document.createTextNode(caption));
	label.appendChild(span);

	const input = document.createElement("input");
	input.value = value ?? "";
	input.addEventListener("input", onInput);
	label.appendChild(input);

	let onChanged;

	function onInput(event) {
		if (onChanged instanceof Function) {
			onChanged(event.target.value);
		}
	}

	return {
		element: label,
		set error(error) { input.setCustomValidity(error); },
		set onChanged(callback) { onChanged = callback },
		set value(newValue) { input.value = newValue },
	};
}

function ParentSiblingsInput(caption, value) {
	const label = document.createElement("label");
	label.classList.add("browser-style");

	const span = document.createElement("span");
	span.appendChild(document.createTextNode(caption));
	label.appendChild(span);

	const input = document.createElement("input");
	input.value = value;
	input.type = "number";
	input.min = "1";
	input.addEventListener("beforeinput", onBeforeInput);
	input.addEventListener("input", onInput);
	label.appendChild(input);

	let onChanged;

	function onBeforeInput(event) {
		/* Do not prevent special characters like Backspace. */
		if (event.data == null) {
			return;
		}

		if (!/^[0-9]+$/.test(event.data)) {
			event.preventDefault();
		}
	}

	function onInput(event) {
		if (!event.target.validity.valid) {
			return;
		}

		if (onChanged instanceof Function) {
			onChanged(parseInt(event.target.value, 10));
		}
	}

	return {
		element: label,
		set onChanged(callback) { onChanged = callback },
	};
}
