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

## Versioning

The package version remains 0.2.0; named tags/releases v0.1.0 and v0.2.0 already
exist. The existing public deployment predates this process and can be ahead
of its latest named tag. It stays unchanged until a regular release is published.

Identify development builds by branch and commit SHA. Keep unreleased changes
under Unreleased in CHANGELOG.md. Do not bump the version for every PR.
For the completed UI redesign, 0.3.0 is proposed; decide the exact version at
release preparation.

1. Prepare a release PR with the package version and dated changelog section.
2. Run checks and obtain explicit acceptance of the complete user workflows.
3. Merge that PR; this still does not deploy.
4. Tag that exact accepted main commit, using `v` plus the package version.
5. Publish the matching regular GitHub Release; this triggers deployment.
6. Verify the Pages deployment and record its result. Do not move existing tags.

Create new release tags from main commits containing the release-only workflow.
Historical commits contain older workflow definitions and are not suitable for
validating this new publication process. A failed deployment is not evidence
that the new version is publicly available.
