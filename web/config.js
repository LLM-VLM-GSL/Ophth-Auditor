// Settings of this copy of the audit page. Loaded before app.js; when the file is missing, app.js uses the defaults.
//   server: false     never call api/*: the static public site (GitHub Pages) has no server
//   encrypted: false  the data in data/ is plaintext (data/manifest.js); do not look for encrypted data
//   relay: ""         the lab's relay (relay/relay.py), an absolute URL such as https://<lab host>/api/ophth-audit:
//                     annotations are saved there as they are made. Empty: they stay in the browser (and Download).
//                     The Pages workflow writes it from the repository variable AUDIT_RELAY_URL; ?relay=<url> overrides it.
window.AUDIT_CONFIG = { server: false, encrypted: false, relay: "" };
