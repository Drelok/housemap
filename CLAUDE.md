# House Map: working notes

A plain static web app with no build step. `js/load.js` loads the scripts in order, and the list in
`sw.js` must be kept in step with it. The CSP forbids inline script and `fetch`.

## UI conventions

- Lengths are shown and typed in feet and inches.
- A tool returns to Select after it is used.
- Nothing is picked for the user: a choice starts empty or unticked until they make it.
- Questions and messages use the in-page dialogs (`ask`, `tell`), never browser alerts.
- An action sits next to the field it affects.
- Tools live in menus, and each has a direct key.
- Pop-up windows (`<dialog>`) all use the shared window layout:
  - `<dialog class="win">`, with a `.winHead` top bar holding a `.winTop` row with the `<h2>` title
    and a round close button (`.roundClose`, `type="button"`, `data-close="cancel"`, the ✕ icon),
    plus any intro text or controls that set what the window shows;
  - a `.winBody` that scrolls under it;
  - and, where the window asks for an answer, a `.actions.winFoot` bottom bar with its buttons.
  - The top and bottom bars stay put while the body scrolls. The ✕ closes as Cancel: nothing changes.
  - Small one-line questions (`#askDialog`) are the exception and keep just their buttons.

## Documentation

`README.md` documents every feature; update it with each change.

## Privacy

Keep anything that identifies the owner's real house (city, address, name, personal email) out of
files, commits and pull requests.
