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

class SeenEvent {
	constructor() {
		this.listeners = [ ];
	}

	get subscribers() {
		return this.listeners.length;
	}

	addListener(callback) {
		if (callback instanceof Function && this.listeners.indexOf(callback) == -1) {
			this.listeners.push(callback);
		}
	}

	removeListener(callback) {
		const index = this.listeners.indexOf(callback);

		if (index > -1) {
			this.listeners.splice(index, 1);
		}
	}

	raiseEvent(...args) {
		for (const listener of this.listeners) {
			listener(...args);
		}
	}
}

const History = (() => {
	let provider = null;
	const providers = { };
	const seenEvent = new SeenEvent();

	function addProvider(name, providerObject) {
		providers[name] = providerObject;
	}

	function setProvider(name) {
		if (!providers.hasOwnProperty(name)) {
			throw new Error(`Unknown history provider: ${ name }`);
		}

		if (provider != null && provider.dispose instanceof Function) {
			provider.dispose();
		}

		provider = providers[name];
		provider.onVisited = raiseEvent;

		if (provider.initialize instanceof Function) {
			return provider.initialize();
		}

		return Promise.resolve(true);
	}

	function addListener(callback) {
		seenEvent.addListener(callback);
	}

	function removeListener(callback) {
		seenEvent.removeListener(callback);
	}

	function raiseEvent(...args) {
		seenEvent.raiseEvent(...args);
	}

	function checkSeen(url, hostname, hostnameSpecific) {
		if (provider == null) {
			throw new Error("No provider set.");
		}

		return provider.checkSeen(url, hostname, hostnameSpecific);
	}

	function clearHistory() {
		if (provider == null) {
			throw new Error("No provider set.");
		}

		if (provider.clearHistory instanceof Function) {
			return provider.clearHistory();
		}

		return Promise.reject("clearHistory is not supported by the current history provider.");
	}

	function setNew(url, hostname) {
		if (provider == null) {
			throw new Error("No provider set.");
		}

		if (provider.setNew instanceof Function) {
			return provider.setNew(url, hostname);
		}

		return Promise.reject("setNew is not supported by the current history provider.");
	}

	function setSeen (url, hostname) {
		if (provider == null) {
			throw new Error("No provider set.");
		}

		if (provider.setSeen instanceof Function) {
			return provider
				.setSeen(url, hostname)
				.then((result) => { raiseEvent(url, hostname); return result });
		}

		return Promise.reject("setSeen is not supported by the current history provider.");
	}

	return {
		/* Methods */
		addProvider: addProvider,
		setProvider: setProvider,
		addListener: addListener,
		removeListener: removeListener,
		checkSeen: checkSeen,
		clearHistory: clearHistory,
		setNew: setNew,
		setSeen: setSeen,
	};
})();

History.addProvider("indexedDB", (function () {
	const databaseName = "seen";
	let db = null;
	let readyPromise = null;

	/*
		Public methods
	*/
	function initialize() {
		return new Promise((resolve, reject) => {
			const request = indexedDB.open("seen");

			request.addEventListener("upgradeneeded", upgradeDatabase);

			request.addEventListener("success", (event) => {
				db = event.target.result;
				resolve();
			});

			request.addEventListener("error", (event) => {
				console.error("Error while opening the database: ", event.target.error);
				reject(event.target.error);
			});
		});
	}

	function dispose() {
		if (db != null) {
			db.close();
			db = null;
		}

		return Promise.resolve(true);
	}

	function checkSeen(url, hostname, hostnameSpecific) {
		if (db == null) {
			throw new Error("Database not ready. Wait for the ready() promise to resolve first.");
		}

		return new Promise((resolve, reject) => {
			const simpleTransaction = new SimpleTransaction();
			simpleTransaction.getKey(url, hostname, hostnameSpecific).then(getRecondAndUpdateTimestamp).then(resolve, reject);
		});
	}

	function clearHistory() {
		if (db == null) {
			throw new Error("Database not ready. Wait for the ready() promise to resolve first.");
		}

		return new Promise((resolve, reject) => {
			const simpleTransaction = new SimpleTransaction();
			const objectStore = simpleTransaction.transaction.objectStore("seen");
			const request = objectStore.clear();

			request.addEventListener("success", (event) => resolve(event.target.result));

			request.addEventListener("error", (event) => {
				console.error("Error adding record: ", record, event.target.error);
				reject(event.target.error);
			});
		});
	}

	function setNew(url, hostname) {
		if (db == null) {
			throw new Error("Database not ready. Wait for the ready() promise to resolve first.");
		}

		return new Promise((resolve, reject) => {
			const transaction = new SimpleTransaction();
			transaction.getKey(url, hostname, true).then(removeRecord).then(resolve, reject);
		});
	}

	function setSeen(url, hostname) {
		if (db == null) {
			throw new Error("Database not ready. Wait for the ready() promise to resolve first.");
		}

		return new Promise((resolve, reject) => {
			const transaction = new SimpleTransaction();
			transaction.getKey(url, hostname, true).then(addOrUpdateRecord).then(resolve, reject);
		});
	}

	/*
		Private methods
	*/

	function upgradeDatabase(event) {
		const db = event.target.result;

		if (event.oldVersion < 1) {
			const objectStore = db.createObjectStore("seen", { autoIncrement : true });

			objectStore.createIndex("url", "url", { unique: false });
			objectStore.createIndex("hostname", "hostname", { unique: false });
			objectStore.createIndex("url, hostname", [ "url", "hostname" ], { unique: true });
		}
	}

	function getRecondAndUpdateTimestamp(getKeyResult) {
		return new Promise((resolve, reject) => {
			const key = getKeyResult.event.target.result;

			if (key == null) {
				resolve(null);
				return;
			}

			const transaction = getKeyResult.event.target.transaction;
			const objectStore = transaction.objectStore("seen");
			const record = { url: getKeyResult.url, hostname: getKeyResult.hostname, timestamp: Date.now() };

			/* Get record and resolve/reject. */
			const getRequest = objectStore.get(key);

			getRequest.addEventListener("success", (event) => {
				resolve(event.target.result);
			});

			getRequest.addEventListener("error", (event) => {
				console.error("Error fetching key: ", key, event.target.error);
				reject(event.target.error);
			});

			/* Try to update the timestamp, the returned promise doesn't depend on this request. */
			const updateTimestampRequest = objectStore.put(record, key);

			updateTimestampRequest.addEventListener("error", (event) => {
				console.error("Error updating timestamp: ", key, event.target.error);
			});
		});
	}

	function addOrUpdateRecord(getKeyResult) {
		return new Promise((resolve, reject) => {
			const transaction = getKeyResult.event.target.transaction;
			const key = getKeyResult.event.target.result;
			const record = { url: getKeyResult.url, hostname: getKeyResult.hostname, timestamp: Date.now() };

			const objectStore = transaction.objectStore("seen");
			const request = objectStore.put(record, key);

			request.addEventListener("success", (event) => {
				resolve(event.target.result);
				history_onVisited(getKeyResult.url, getKeyResult.hostname);
			});

			request.addEventListener("error", (event) => {
				console.error("Error adding record: ", record, event.target.error);
				reject(event.target.error);
			});
		});
	}

	function removeRecord(getKeyResult) {
		return new Promise((resolve, reject) => {
			const transaction = getKeyResult.event.target.transaction;
			const key = getKeyResult.event.target.result;

			const objectStore = transaction.objectStore("seen");
			const request = objectStore.delete(key);

			request.addEventListener("success", (event) => resolve(event.target.result));

			request.addEventListener("error", (event) => {
				console.error("Error removing record: ", record, event.target.error);
				reject(event.target.error);
			});
		});
	}

	let onVisited;

	function history_onVisited(url, hostname) {
		if (onVisited instanceof Function) {
			onVisited(url);
		}
	}

	class SimpleTransaction {
		constructor(oncomplete, onerror, readOnly) {
			this.transaction = db.transaction(["seen"], readOnly ? "readonly" : "readwrite");

			this.transaction.addEventListener("complete", (event) => {
				if (oncomplete instanceof Function) {
					oncomplete(event);
				}
			});

			this.transaction.addEventListener("error", (event) => {
				console.error("Transaction error: ", event);

				if (onerror instanceof Function) {
					onerror(event);
				}
			});
		}

		getKey(url, hostname, hostnameSpecific) {
			return new Promise((resolve, reject) => {
				const objectStore = this.transaction.objectStore("seen");
				const index = objectStore.index(hostnameSpecific ? "url, hostname" : "url");
				const request = index.getKey(hostnameSpecific ? [url, hostname] : url);

				request.addEventListener("success", (event) => resolve({ event: event, url: url, hostname: hostname }));
				request.addEventListener("error", reject);
			});
		}
	}

	return {
		set onVisited(callback) { onVisited = callback },
		initialize,
		dispose,
		checkSeen,
		clearHistory,
		setNew,
		setSeen,
	};
})());

History.addProvider("browser", (() => {
	function initialize() {
		browser.history.onVisited.addListener(history_onVisited);
		return Promise.resolve(true);
	}

	function dispose() {
		browser.history.onVisited.removeListener(history_onVisited);
		return Promise.resolve(true);
	}

	function checkSeen(url) {
		return browser.history.search({ text: url, maxResults: 1 }).then(result => result.length > 0);
	}

	function setNew(url, hostname) {
		return browser.history.deleteUrl({ url });
	}

	function setSeen(url, hostname) {
		return browser.history.addUrl({ url });
	}

	let onVisited;

	function history_onVisited(historyItem) {
		if (onVisited instanceof Function) {
			onVisited(historyItem.url);
		}
	}

	return {
		set onVisited(callback) { onVisited = callback },
		initialize,
		dispose,
		checkSeen,
		setNew,
		setSeen,
	};
})());
