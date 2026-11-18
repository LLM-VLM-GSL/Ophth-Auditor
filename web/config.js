// Settings of this copy of the audit page. Loaded before app.js; when the file is missing, app.js uses the defaults.
//   server: "auto"  (default) when the page is served over http(s), autosave to the local audit server (serve.py of
//                   the offline package) if its api/ping answers
//   server: false   never call api/*: the static public site (GitHub Pages) has no server
window.AUDIT_CONFIG = { server: false };
