# Contributing to Utterance

## Reporting a bug

Open an issue at [GitHub issues](https://github.com/macCesar/Utterance/issues) with the module version, the platform and OS version, the Titanium SDK version, the steps to reproduce and the relevant part of the log.

## Repository layout

- `android/`: Android module (Java) and its `dist/` zip.
- `ios/`: iOS module (Objective-C) and its `dist/` zip.
- `documentation/`: TTS, STT and migration guides.
- `examples/`: example code.
- `tests/`: console diagnostics. Copy one into a Titanium app that includes the module, run it and read the log.

## Building

```bash
cd ios && ti build -p ios --build-only
cd android && ti build -p android --build-only
```

## Pull requests

- Keep each pull request to one change.
- Write commit messages in the Conventional Commits style the history uses, e.g. `fix(android): …` or `docs: …`.
- If you change behavior or the API, update `README.md` and the guides in `documentation/`.
- Say which platforms and devices you tested on.

Contributions are released under the Apache 2.0 license.
