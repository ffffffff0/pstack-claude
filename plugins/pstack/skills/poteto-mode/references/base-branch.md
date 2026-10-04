# Base branch

"The diff against the base" means against the branch this work was cut from, not a fixed `main`. Many repos cut feature branches from a release or dated integration branch.

1. A base the user or caller named wins.
2. Otherwise run the finder under the installed plugin, from the worktree under review:

   ```shell
   node <plugin>/skills/poteto-mode/scripts/base-branch.mjs
   ```

   It prints `{"base", "source", "confident"}`. It reads the branch's reflog for the branch it was created from, and a later rebase onto a newer branch moves the base to that branch. With no usable record, it guesses the nearest remote branch, limited to `git config pstack.baseBranches` patterns (such as `origin/DEV-* origin/main`) when the repo sets them.
3. `confident: true`: use the base and name it in your reply. `confident: false`: ask the user to confirm the guess before reviewing. Exit 3: ask the user which branch the work was cut from.

Diff from the merge-base, so commits the base gained since the cut stay out: `git diff <base>...HEAD` for committed work, or `git diff $(git merge-base <base> HEAD)` to include the working tree.
