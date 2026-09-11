# Premiere Media Ingest

A Premiere Pro extension for importing supported video URLs and placing selected ranges on the timeline.

## Version status

- **Latest:** V6.0.0
- **Known-good baseline:** V4.3.2
- **Previous important release:** V5.4.6

See [`docs/VERSION_STATUS.md`](docs/VERSION_STATUS.md) for the release policy.

## Repository layout

```text
premiere-media-ingest-v1/
├── backend/                  # backend/resolver project files
├── plugin/                   # older plugin copy; remove after final V6 verification
├── releases/                 # versioned releases and installers
│   ├── baseline/v4.3.2/      # established fallback reference
│   ├── v5.4.5/               # historical release
│   ├── v5.4.6/               # previous stable feature build
│   └── v6.0.0/               # latest release
└── docs/                     # project/version documentation
```

## Cleanup policy

Only the latest release, the known-good baseline, and useful regression/debugging predecessors should remain prominent. Intermediate development copies should not be treated as active source trees.
