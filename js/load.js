'use strict';

// Loads the app's scripts, in this order, from the end of the page.
for (const name of ['util', 'store', 'plan', 'photos', 'aerial', 'tips', 'help', 'archive', 'interior', 'fixtures', 'canvas', 'panels', 'issues', 'search', 'print', 'brief', 'house', 'review', 'landing', 'main']) {
  document.write(`<script src="${fresh('js/' + name + '.js')}"><\/script>`);
}
