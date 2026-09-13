# Integration and releases

## Current state

The package version is 0.2.0. Git tags and GitHub Releases exist for v0.1.0 and
v0.2.0. Changes since the latest named release are recorded under Unreleased
in CHANGELOG.md. The deployed main branch can be ahead of the latest tag:
Deploy Pages currently runs on every push to main and on manual dispatch.

## UI redesign delivery rule

PRs #10, #11 and #12 were merged into `integration/ui-redesign` on 2026-09-13.
That branch is the shared integration base for the UI redesign in issue #2.
New UI work should use focused branches and PRs targeting it. Keep main and
the public site unchanged while the new workflows are incomplete.

Test locally or through a separately configured preview. Do not manually run
the production Pages workflow against integration or feature branches.
Passing CI is a technical requirement, not acceptance of the user experience.
The complete workflows require explicit user acceptance before a release PR
from integration is merged into main. No such release is approved yet.

## Versioning at release

Do not bump the package version or create release tags for each integration
merge. Identify development builds by branch and commit SHA. Keep their changes
under Unreleased until the release scope is accepted.

For the completed UI redesign, 0.3.0 is the proposed next release; the exact
version is decided when preparing the release. At that point, update the
package version and dated changelog section in the release PR, run all checks,
obtain acceptance, and merge. Under the current workflow this merge deploys.
After successful deployment, tag that exact release commit and create the
matching GitHub Release. Do not move an existing tag to newer code.

Version tags currently document releases; they do not control deployment.
Changing deployment to be triggered by versioned releases would be a separate
workflow change, not something this integration silently enables.
