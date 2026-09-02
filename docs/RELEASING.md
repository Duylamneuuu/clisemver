# Releasing

Releases are intentionally cloud-only.

1. Update `package.json` and `src/version.js` to the same SemVer version.
2. Move completed changelog entries under a dated version heading.
3. Regenerate `.clisemver/snapshot.json` if the public CLI changed.
4. Open and merge a pull request into `main`.

After the `CI` workflow succeeds for a push to the default branch, the `Release`
workflow checks whether `v<package version>` already exists. For a new version it
creates the tag at the tested commit, packs the npm tarball, and attaches it to a
GitHub release. Existing versions are skipped, so ordinary commits do not create
duplicate releases.

The release workflow deliberately does not publish to npm until trusted publishing
is configured for the package.
