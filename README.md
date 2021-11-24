# Seen

A Firefox extension to help you quickly identify new content and hide content you have already seen.  
Old content can be hidden either automatically, or with a single mouse click / keyboard shortcut.

![Short animated demo](preview.png)

## Usage

1. Navigate to a supported site.
2. Click on the seen action button (located inside the address bar).
3. You can grant the permission to access data so that the extension is activated automatically on future visits.
Alternatively, you can disable the permission request in the settings and only activate the extension when the action button is pressed.

The action button can be activated with a keyboard shortcut (Alt+Z by default).
You can configure this shortcut by navigating to `about:addons`, click on the gear on the top right and select `Manage Extension Shortcuts`.

You can open the extension's settings by middle-clicking the action button.

## Supported sites:
- reddit.com
- news.ycombinator.com
- lobste.rs

## Adding support for a site manually

It is possible to support any sites by adding a new rule through the options page. The following fields can be set in order to modify the behavior of the extension.

- `Name`: The name of the rule.
- `Hostname`: The hostname on which to apply the rule on (e.g. `news.ycombinator.com`).
- `Link query`: A CSS selector, targeting the elements which contain a unique id, such as a url.  
See: [Locating DOM elements using selectors](https://developer.mozilla.org/en-US/docs/Web/API/Document_object_model/Locating_DOM_elements_using_selectors), [CSS selectors](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_Selectors).
- `Parent query`: Allows selecting a parent element on which to apply styles.
- `Parent siblings`: Specifies additional parent elements on which to apply styles.
- `Identifier key`: Specifies the key from which to extract the unique id. If empty, the value from `href` is used.

Examples of usage can be found in [sites.json](/src/sites.json).

## Privacy policy

The extension stores a list of seen urls locally on your computer. The list is not shared with other parties or uploaded to the internet.
In the future, it might be uploaded to the internet for the purposes of synchronizing the seen urls between different computers, but will be disabled by default.
It is possible to disable this behavior in the extension's options by allowing it to access your browser's history and use that to track seen urls.
