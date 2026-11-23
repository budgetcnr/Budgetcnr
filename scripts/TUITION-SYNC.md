# Tuition import through the existing Google Drive connection

Read the private source workbook with ChatGPT's existing authorized Google Drive
connection, download its current XLSX bytes, then validate locally. GitHub does
not fetch Google data. No Google Cloud project, service account, new Google
credential, public sharing or additional Google billing setup is needed.

## Initial setup after approved commit

1. Run `Preview or sync latest tuition sheet` on `main`, operation `public-key`.
   The summary contains a public transfer key derived from the existing
   `ROSTER_CREDENTIAL_KEY` repository secret. That secret and the existing
   `CLOUDFLARE_D1_API_TOKEN` remain inside GitHub Actions.
2. Verify that the run belongs to this repository, branch and approved commit.
   Save the public JSON as `tuition-transfer-public.json`. It is safe to commit
   this public key for use in subsequent encrypted transfers.
3. Download the latest source XLSX with the Google Drive connector. Never
   commit the workbook or decrypted student JSON.

## Prepare transfer

```sh
python -m pip install -r scripts/tuition-sync-requirements.txt
python scripts/read-tuition-sheet.py --file /path/to/current.xlsx --output /tmp/tuition.json
node scripts/tuition-transfer.mjs seal tuition-transfer-public.json /tmp/tuition.json cloudflare/tuition-sheet-live.enc.json
```

Show the aggregate preview and ask for commit/upload approval. Commit only the
public key and encrypted envelope. Run operation `preview` to decrypt in memory
and compare with D1 without writes. Run `apply` when saving has been authorized.
Every staged row is read back before a conditional active-version update. A
staging failure preserves the prior active fee snapshot; retries rebuild the
inactive snapshot. Identical balances are a no-op.

The transfer uses Node X25519 Diffie-Hellman, HKDF-SHA256 and AES-256-GCM with
fresh ephemeral keys, salt and nonce. A public key does not authenticate the
sender: repository write access and approval control which envelope Actions
may process. Rotating the existing secret requires exporting its new public
key and resealing source data. Old-key transfers are rejected.

The October importer remains a manual historical recovery tool. Its automatic
push trigger is removed so edits cannot replay its fixed 532-record snapshot.
Neither workflow schedules imports. The paused ChatGPT automation remains
paused until an end-to-end production preview and verified import succeed.
A future recurring task must read via connected Drive and use this encrypted
transfer procedure. GitHub Google access is not needed.

## Workbook rules

- Require the four existing grade worksheets; validate IDs and money.
- Use the report date from the workbook. Blank future term placeholders do not
  clear separately imported newer fees such as semester 2/2569.
- Replace only covered terms for listed students and current classroom members.
  Preserve uncovered terms/classrooms and existing account credentials.
- Preserve source totals if term details differ; mark details unavailable.
- Count new-student rows for separate account review, including missing IDs.
- Do not log student records, credentials or plaintext transfer data.

Tests need no external credentials:

```sh
node --test tests/sync-tuition-sheet.test.mjs tests/tuition-transfer.test.mjs
python -m unittest discover -s tests -p 'test_tuition_sheet.py'
```

Passing local tests does not confirm D1 access or a production update. Initial
public-key export and production verification remain required after commit.
