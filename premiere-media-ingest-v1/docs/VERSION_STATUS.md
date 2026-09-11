# Media Ingest Version Status

## Current release
**V6.0.0 — Latest**

V6.0.0 is the current release and should be the first version used for new testing and development.

## Established baseline
**V4.3.2 — Known-good baseline**

V4.3.2 is retained as the fallback baseline for the core download/import/timeline workflow.

## Previous important release
**V5.4.6 — Previous stable feature build**

V5.4.6 contains the Stack-insertion track-search fix that resolved the earlier "No free track space" failure.

## Release policy
- Keep the latest release in `releases/v6.0.0/`.
- Keep the known-good fallback in `releases/baseline/v4.3.2/`.
- Keep one immediate predecessor when it is useful for regression debugging.
- Older intermediate builds should be archived in Git history rather than kept as active-looking project folders.
