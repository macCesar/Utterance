# Contributing to Utterance

Utterance is a Titanium module for text-to-speech and speech-to-text on iOS and Android. It is maintained in this repository, and the original one is archived. Bug reports, fixes and documentation improvements are welcome.

## Reporting a bug

Open an issue at [GitHub issues](https://github.com/macCesar/Utterance/issues) and include:

- The module version, the Titanium SDK version, the platform and the OS version.
- The device model. For speech-to-text on Android, also the speech recognizer the device uses (usually Google).
- The steps to reproduce it, and the lines of the log around the failure.

Do not attach audio recordings or anything personal.

## What you need

- Titanium SDK 13.4.1, the version `ios/titanium.xcconfig` points to. The modules declare 13.0.0 as the minimum.
- The Titanium CLI (`npm install -g titanium`).
- Xcode, for iOS. The deployment target is iOS 15.0.
- A JDK and the Android SDK, for Android. Point the CLI at the SDK with `ti config android.sdkPath <path>`.

The maintainer builds with Titanium CLI 9.1, Xcode 27 and JDK 21.

## Repository layout

- `ios/`: the iOS module (Objective-C) and its `dist/` zip.
- `android/`: the Android module (Java) and its `dist/` zip.
- `ios/example/` and `android/example/`: the demo app, `app.js` and `semantic.colors.json`. The two folders hold identical files.
- `documentation/`: the text-to-speech, speech-to-text and migration guides.
- `documentation/proposals/`: changes that are planned but not implemented.
- `examples/`: smaller scripts for one feature each.
- `tests/`: console diagnostics.
- `CHANGELOG.md`: what changed in each version.

## Building

```bash
cd ios && ti build -p ios --build-only
cd android && ti build -p android --build-only
```

Each build writes the zip to `dist/`, and those zips are tracked in git. A rebuilt zip changes the published release, so do not commit it in a pull request. Put it back with `git checkout -- ios/dist android/dist` before you commit.

## Testing

There is no automated test suite. Check a change by running it:

- Copy `ios/example/app.js` and `ios/example/semantic.colors.json` into the `Resources` folder of a Titanium app that includes the module. The comment at the top of the file lists the `tiapp.xml` settings it needs. The Speak tab exercises text-to-speech and the Listen tab speech-to-text.
- Copy one of the scripts in `tests/` into an app, run it and read the log.
- Use a real device for speech-to-text. The iOS Simulator has no microphone, so speech-to-text cannot work there.

Say in the pull request which platforms and devices you tested on, and what you did not test.

## Changing the code

- Follow the style of the file you are editing.
- Keep each pull request to one change.
- If you change behavior or the API, update in the same pull request:
  - `README.md` and the guides in `documentation/`.
  - The `Unreleased` section of `CHANGELOG.md`.
  - Both `example/app.js` files, if they use the changed API. Check them with `cmp ios/example/app.js android/example/app.js`.

## Commits and pull requests

- Branch from `main`.
- Write commit messages in the [Conventional Commits](https://www.conventionalcommits.org/) style the history uses, such as `fix(android): ...`, `feat(ios): ...` or `docs: ...`.
- In the pull request, describe the problem, what you changed and how you tested it.

## Releasing

Versions follow [Semantic Versioning](https://semver.org/). A change that breaks existing calls bumps the major version. A release is a single `chore(release): vX.Y.Z` commit that:

1. Moves the `Unreleased` entries of `CHANGELOG.md` under the new version and its date, and updates the links at the bottom of the file.
2. Sets `version:` in `ios/manifest` and `android/manifest`.
3. Sets `MODULE_VERSION` in `ios/Classes/BencodingUtteranceModule.m` and `android/src/bencoding/utterance/UtteranceModule.java`.
4. Updates the version shown in `README.md` and the guides.
5. Builds both modules and replaces the old zips in `ios/dist/` and `android/dist/` with the new ones.

Then tag the commit `vX.Y.Z`, push the tag, and publish a GitHub release with both zips attached.

## License

Contributions are released under the Apache 2.0 license.
