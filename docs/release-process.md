# Development and releases

## Development

`main` is the shared development branch. Use focused feature branches and
reviewed pull requests targeting main. CI runs on pull requests and main pushes;
a merge or push to main does not publish the website.

PRs #10, #11 and #12 were first combined in `integration/ui-redesign`. PR #13
returns that work to main after the release-only workflow is installed by #14.
The temporary integration branch is no longer the base for new UI work.

Passing CI establishes technical checks, not usability acceptance. The UI
redesign in issue #2 needs review of complete workflows before publication.
Test development locally or through a separately configured preview.

## Publication

Pages deploys only on `release.published` for a release whose draft and
prerelease flags are both false. The build checks out the release event SHA,
runs tests, build and Chromium browser tests, then deploys that artifact.
The Pages environment permits version tags matching `v*`, not branch main.
There is no production push trigger or manual-dispatch entry point.

Creating or pushing a tag alone does not publish. Draft releases and prereleases
do not update the public website. Publishing a regular GitHub Release is the
explicit publication action and requires user acceptance of the release scope.

## R runtime and R packages

Every build serves the R runtime and the pinned R packages itself (K43,
2026-11-22). `pnpm build` runs `scripts/vendor_r_runtime.mjs` first; CI and
the Pages deployment also run it as a separate step (`pnpm vendor:r`) with the
package archives cached by the hash of `src/core/mixedModel/rRuntimePins.json`.
The script stops the build when a downloaded file's SHA-256, a package's
DESCRIPTION or the installed `webr` version differs from the pins. A release
therefore ships exactly the pinned versions; changing one is a method decision
(docs/remaining-method-decisions.md) with new checksums in the pin file.

Before a release, check that the build contains `webr/`, `r-packages/`,
`THIRD-PARTY-NOTICES.txt` and `licenses/`, and that a real fit on the deployed
site requests nothing from another host (smoke checklist). The deployment is
about 80 MB. If `repo.r-wasm.org` no longer offers a pinned archive, the build
fails; restore the verified files into `public/r-packages/` (for example from
the CI cache or an earlier build) or change the pin deliberately.

## Versioning

The release-preparation package version is 0.3.0; named tags/releases v0.1.0
and v0.2.0 already exist. Version metadata does not establish release acceptance.
The existing public deployment predates this process and can be ahead of its
latest named tag. It stays unchanged until a regular release is published.

Identify development builds by branch and commit SHA. Keep unreleased changes
under Unreleased in CHANGELOG.md. Do not bump the version for every PR.
The UI redesign is prepared as 0.3.0; its [release notes](releases/0.3.0.md)
record the scope, verification and owner approval. On 2026-10-09 the owner
explicitly authorized publication of that scope after technical workflow checks,
while leaving representative research/user acceptance and a fresh real-WebR
smoke run open. That publication approval does not establish research, clinical
or first-user acceptance. Publication and deployment verification are pending.

1. Prepare a release PR with the package version and dated changelog section.
2. Run technical workflow checks and obtain explicit owner acceptance of the
   release scope. Record any research/user acceptance left open separately;
   technical checks alone do not establish it or authorize publication.
3. Merge that PR; this still does not deploy.
4. Tag that exact accepted main commit, using `v` plus the package version.
5. Publish the matching regular GitHub Release; this triggers deployment.
6. Verify the Pages deployment and record the actual deployment evidence on
   the GitHub Release page after publication. Do not move existing tags.

Create new release tags from main commits containing the release-only workflow.
Historical commits contain older workflow definitions and are not suitable for
validating this new publication process. A failed deployment is not evidence
that the new version is publicly available.
