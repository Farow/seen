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

const Config = (() => {
	/* Use Object.assign for these, since we return them. */
	const sites = { };
	const options = { };

	const defaultOptions = {
		activateAutomatically: true,
		historyProvider: "indexedDB",
		trackSeparately: false,
		markSeenOn: "click",
		markAllSeenOnUnload: false,
		globalStyle: ".seen {\n\topacity: .5;\n}\n\n.hidden { display: none; }\n\n.new {\n\tbox-shadow: -2px 0px 0px 0px hsl(210, 100%, 75%);\n\ttransition: opacity 2s cubic-bezier(.07, .95, 0, 1);\n}\n\n.new.seen {\n\tbox-shadow: none;\n\ttransition: opacity 2s cubic-bezier(.07, .95, 0, 1);\n}",
	};

	let readyPromise;

	function init() {
		if (readyPromise != null) {
			throw new Error("init() has already been called.");
		}

		let readyResolve, readyReject;
		readyPromise = new Promise((resolve, reject) => [ readyResolve, readyReject ] = [ resolve, reject ]);

		const readyPromises = [
			loadSites(),
			loadOptions().then(() => History.setProvider(options.historyProvider)),
		];

		Promise.all(readyPromises).then(() => readyResolve(), readyReject);

		return readyPromise;
	}

	function ready() {
		if (readyPromise == null) {
			return init();
		}

		return readyPromise;
	}

	function getSiteConfig(hostname) {
		const hostnameTokens = hostname.split('.');
		for (const site in sites) {
			const siteTokens = site.split('.');

			if (tokensMatch(siteTokens, hostnameTokens)) {
				return { isSupported: true, hostname: site, ...sites[site], ...options };
			}
		}

		return { isSupported: false };
	}

	function checkSeen(url, hostname) {
		return History.checkSeen(url, hostname, options.trackSeparately);
	}

	function setSeen(url, hostname) {
		return History.setSeen(url, hostname);
	}

	/*
		Private methods
	*/

	function loadSites() {
		return (
			fetch(browser.runtime.getURL("sites.json"))
			.then(response => response.json())
			.then(result => Object.assign(sites, result))
			.catch(error => { throw new Error(`loadSites error: ${ error }`); })
		);
	}

	/*
		Use the default options on error.
		Note: storage.sync can retain data even if the extension is uninstalled while sync is disabled.
	*/
	function loadOptions() {
		return (
			browser.storage.sync.get()
			.then(storedOptions => { return { ...defaultOptions, ...storedOptions }; })
			.catch(error => {
				console.error("Could not load options: ", error);
				return defaultOptions;
			})
			.then(result => Object.assign(options, result))
		);
	}

	function tokensMatch(siteTokens, hostnameTokens) {
		/*
			Remove any subdomains from the hostname so the arrays match in length if hostname > siteTokens, then compare.
			e.g. a site defined as reddit.com will match www.reddit.com, old.reddit.com etc.
			     a site defined as news.ycombinator.com will not match ycombinator.com.
		*/
		return tokensAreEqual(siteTokens, hostnameTokens.slice(-siteTokens.length));
	}

	function tokensAreEqual(a, b) {
		if (a.length != b.length) {
			return false;
		}

		for (const i = 0; i < a.length; a++) {
			if (a[i] != b[i]) {
				return false;
			}
		}

		return true;
	}

	return {
		/* Fields */
		sites: sites,
		options: options,

		/* Methods */
		ready: ready,
		getSiteConfig: getSiteConfig,
		checkSeen: checkSeen,
		setSeen: setSeen,
	};
})();
