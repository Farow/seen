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

"use strict";

init();

function init() {
	readDataParam();
	addEventListeners();
}

function readDataParam() {
	const dataInput = document.getElementById("importData");

	const searchParams = new URLSearchParams(document.location.search);
	const dataParam = searchParams.get("data");

	if (!dataParam.startsWith("ext+seen://")) {
		alert("Invalid data.");
		console.error("Invalid data:", dataParam);
		dataInput.value = dataParam;
		return;
	}

	try {
		const prettyData = JSON.stringify(JSON.parse(decodeURIComponent(searchParams.get("data").replace("ext+seen://", ""))), null, 4);
		dataInput.value = prettyData;
	}
	catch (error) {
		alert("Invalid data.");
		console.error("Invalid data:", error);
		dataInput.value = decodeURIComponent(searchParams.get("data").replace("ext+seen://", ""));
	}
}

function addEventListeners() {
	document.getElementById("import").addEventListener("click", onImport);
	document.getElementById("back").addEventListener("click", onBack);
	document.getElementById("close").addEventListener("click", onClose);
}

function onImport() {
	try {
		const data = JSON.parse(document.getElementById("importData").value);
		const overwrite = document.getElementById("overwrite").checked;
		browser.runtime.sendMessage({ command: "importSiteRule", args: [ data, overwrite ] })
		.then(result => alert("Import succeded."))
		.catch(error => alert("Import failed: " + error));
	}
	catch (error) {
		alert("Invalid data.");
		console.error(error);
	}
}

function onBack() {
	history.back();
}

function onClose() {
	browser.tabs.getCurrent().then(tab => browser.tabs.remove(tab.id));
}
