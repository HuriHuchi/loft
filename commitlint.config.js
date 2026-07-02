// Enforces Conventional Commits so release-please can derive versions + changelog.
// config-conventional allows types: feat, fix, docs, style, refactor, perf,
// test, build, ci, chore, revert. Only feat/fix (and `!`/BREAKING CHANGE) cut a
// release; the rest land on main without bumping the version.
module.exports = {
  extends: ['@commitlint/config-conventional']
}
