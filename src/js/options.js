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
	importHelperInput: document.getElementById("importHelper"),
	importInput: document.getElementById("import"),
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

		if (message.hasOwnProperty("command")) {
			const args = message.hasOwnProperty("args") ? message.args : [ ];

			switch (message.command) {
				case "importError":
					alert("Import failed: " + args[0]);
					break;

				case "importSuccess":
					// TODO: handle more gracefully.
					alert("Import succeded.");

					// Bypass cache: https://developer.mozilla.org/en-US/docs/Web/API/Location/reload#location.reload_has_no_parameter
					// When reloading a page, values of inputs can be cached, such as the checked state of a checkbox input.
					// This leads to inputs displaying an incorrect value.
					location.reload(true);
					break;

				default:
					console.warn("Unhandled command:", message.command);
			}

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
		elements.sitesInput.onSiteNameChanged = onSiteNameChanged;
		elements.sitesInput.onSiteKeyChanged = onSiteKeyChanged;
		elements.sitesInput.onSiteRemoved = onSiteRemoved;
		elements.importInput.addEventListener("click", onImport);
		elements.importHelperInput.addEventListener("change", onImportFile);
		elements.exportInput.addEventListener("click", onExport);
	}

	function onSiteNameChanged(oldName, newName) {
		const site = sites[oldName];
		delete sites[oldName];
		sites[newName] = site;
		BackgroundPort.notify({ command: "siteNameChanged", args: [ oldName, newName ] });
	}

	function onSiteKeyChanged(hostname, key, value) {
		sites[hostname][key] = value;
		BackgroundPort.notify({ command: "siteKeyChanged", args: [ hostname, key, value ] });
	}

	function onSiteRemoved(hostname) {
		delete sites[hostname];
		BackgroundPort.notify({ command: "siteRemoved", args: [ hostname ] });
	}

	function onImport() {
		elements.importHelperInput.click();
	}

	function onImportFile(event) {
		const reader = new FileReader();
		reader.addEventListener("load", onImportFileLoaded);
		reader.readAsText(event.target.files[0]);
	}

	function onImportFileLoaded(event) {
		BackgroundPort.notify({ command: "import", args: [ event.target.result ] });
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

	summary.appendChild(document.createTextNode("Site rules"));
	details.appendChild(summary);

	const addSiteButton = document.createElement("button");
	addSiteButton.appendChild(document.createTextNode("Add new site"));
	addSiteButton.classList.add("browser-style", "add-button");
	addSiteButton.addEventListener("click", addSiteButton_onClick);
	details.appendChild(addSiteButton);

	for (const hostname of Object.keys(sites).sort()) {
		const siteDetails = new SiteDetails(hostname, sites[hostname]);
		siteDetails.onSiteNameChanged = site_onSiteNameChanged;
		siteDetails.onSiteKeyChanged = site_onSiteKeyChanged;
		siteDetails.onSiteRemoved = site_onSiteRemoved;
		details.appendChild(siteDetails.element);
	}

	let onSiteNameChanged, onSiteKeyChanged, onSiteRemoved;

	function addSiteButton_onClick(event) {
		const exampleName = generateNextExampleName();
		const newSite = { links: "", hostname: "www.example.com" };
		sites[exampleName] = newSite;

		const siteDetails = new SiteDetails(exampleName, newSite);
		siteDetails.onSiteNameChanged = site_onSiteNameChanged;
		siteDetails.onSiteKeyChanged = site_onSiteKeyChanged;
		siteDetails.onSiteRemoved = site_onSiteRemoved;
		addSiteButton.insertAdjacentElement("afterend", siteDetails.element);
	}

	function site_onSiteNameChanged(oldName, newName) {
		if (onSiteNameChanged instanceof Function) {
			onSiteNameChanged(oldName, newName);
		}
	}

	function site_onSiteKeyChanged() {
		if (onSiteKeyChanged instanceof Function) {
			onSiteKeyChanged(...arguments);
		}
	}

	function site_onSiteRemoved(hostname, detailsElement) {
		details.removeChild(detailsElement);

		if (onSiteRemoved instanceof Function) {
			onSiteRemoved(hostname);
		}
	}

	function contains(hostname) {
		return sites.hasOwnProperty(hostname);
	}

	function generateNextExampleName() {
		if (!sites.hasOwnProperty("www.example.com")) {
			return "www.example.com";
		}

		let counter = 2;

		while (sites.hasOwnProperty("www.example.com - " + counter)) {
			counter++;
		}

		return "www.example.com - " + counter;
	}

	return {
		element: details,
		set onSiteNameChanged(callback) { onSiteNameChanged = callback },
		set onSiteKeyChanged(callback) { onSiteKeyChanged = callback },
		set onSiteRemoved(callback) { onSiteRemoved = callback },
		contains: contains,
	};
}

function SiteDetails(name, options) {
	const details = document.createElement("details");

	const summary = document.createElement("summary");
	summary.appendChild(document.createTextNode(name));
	details.appendChild(summary);

	const removeButton = new RemoveButton("Remove");
	removeButton.onClick = removeButton_onClick;
	summary.appendChild(removeButton.element);

	const detailsWrapper = document.createElement("div");
	details.appendChild(detailsWrapper);

	const nameInput = new NameInput("Name", name);
	nameInput.onChanged = name_onChanged;
	detailsWrapper.appendChild(nameInput.element);

	const hostnameInput = new TextInput("Hostname", options.hostname);
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

	const idKeyInput = TextInput("Identifier key", options.idKey ?? "");
	idKeyInput.onChanged = idKey_onChanged;
	detailsWrapper.appendChild(idKeyInput.element);

	const styleInput = new TextAreaInput("Style", options.style ?? "");
	styleInput.onChanged = style_onChanged;
	detailsWrapper.appendChild(styleInput.element);

	let onSiteRemoved, onSiteNameChanged, onSiteKeyChanged;

	function name_onChanged(newName) {
		if (onSiteNameChanged instanceof Function) {
			onSiteNameChanged(name, newName);
		}
		summary.firstChild.nodeValue = newName;
		name = newName;
	}

	function hostname_onChanged(newValue) {
		dispatchDetailsChanged(name, "hostname", newValue);
	}

	function link_onChanged(newValue) {
		dispatchDetailsChanged(name, "links", newValue);
	}

	function parent_onChanged(newValue) {
		dispatchDetailsChanged(name, "parent", newValue);
	}

	function parentSiblings_onChanged(newValue) {
		dispatchDetailsChanged(name, "parentSiblings", newValue);
	}

	function idKey_onChanged(newValue) {
		dispatchDetailsChanged(name, "idKey", newValue);
	}

	function style_onChanged(newValue) {
		dispatchDetailsChanged(name, "style", newValue);
	}

	function dispatchDetailsChanged() {
		if (onSiteKeyChanged instanceof Function) {
			onSiteKeyChanged(...arguments);
		}
	}

	function removeButton_onClick() {
		if (onSiteRemoved instanceof Function) {
			onSiteRemoved(name, details);
		}
	}

	return {
		element: details,
		set onSiteNameChanged(callback) { onSiteNameChanged = callback },
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

function NameInput(caption, hostname) {
	const textInput = new TextInput(caption, hostname);
	textInput.onChanged = onTextInputChanged;

	let onChanged;

	function onTextInputChanged(newName) {
		if (newName == hostname) {
			textInput.error = "";
			return;
		}

		if (newName.length == 0) {
			textInput.error = "Name cannot be empty.";
			return;
		}

		if (elements.sitesInput.contains(newName)) {
			textInput.error = "Name already exists.";
			return;
		}

		hostname = newName;
		textInput.error = "";

		if (onChanged instanceof Function) {
			onChanged(newName);
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

function TextAreaInput(caption, value) {
	const label = document.createElement("label");
	label.classList.add("browser-style");
	label.appendChild(document.createTextNode(caption));

	const textArea = document.createElement("textarea");
	textArea.value = value;
	textArea.classList.add("browser-style");
	textArea.addEventListener("change", onChange);
	label.appendChild(textArea);

	let onChanged;

	function onChange(event) {
		if (onChanged instanceof Function) {
			onChanged(event.target.value);
		}
	}

	return {
		element: label,
		set onChanged(callback) { onChanged = callback },
	}

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
