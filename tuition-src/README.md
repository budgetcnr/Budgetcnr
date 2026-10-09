# CNR tuition

Migrated from the existing CNR tuition Site version 14, source commit
55f5ae407cf1e1982b9d01f00320999cd1e452c1. The original React interface,
IBM Plex Sans Thai fonts, tuition rules and advisory permissions are retained.

Production is served at `/tuition/` by the `budgetcnr` Cloudflare Worker.
The Worker reads `cnr-tuition` through the `DB` binding and requires the
runtime secret `ROSTER_CREDENTIAL_KEY`. GitHub Pages redirects this route
to the Worker because Pages cannot run the authenticated D1 API.

To rebuild the committed browser assets and Worker API:

```sh
npm --prefix tuition-src install
node scripts/build-tuition.mjs
```

Commit the regenerated `tuition/assets` and `cloudflare/tuition-api.mjs`.
The normal Cloudflare deployment uses these assets and does not need to
install the UI dependencies. Student IDs, birth-date passwords, roster data,
and credential keys are never part of the browser build. Private smoke-test
inputs and migration data are AES-256-GCM encrypted; their key stays in Secrets.

Only the two login/check APIs and a readiness check are exposed. Import
endpoints from the original Site are intentionally not part of this Worker.
Teacher roster requests batch shared fee data to avoid one set of D1 queries
per student. The M.1/M.4 paid confirmation remains bound to the 10 September
2569 report version and is not applied automatically to future reports.
