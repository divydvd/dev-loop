# Screenshot step for UI changes (dev-loop 0.2.1)

## Acceptance record
- **Goal:** for a UI change, the PR body shows the screenshots of the validated screens, so that the owner does not have to ask for them.
- **Done when:**
  - [x] The PR template has a "Screenshots" section: an HTML table with `<img width="180">`, or "none: <reason>".
  - [x] `dev-loop` step 6 takes a screenshot of each validated screen, and keeps it outside the repo. Step 7 checks each screenshot for personal data and secrets. It uploads only the safe screenshots with `github-pr-media`, puts each URL in the table, and does not commit a screenshot.
  - [x] Skill test F: with the new text, the UI runs put the screenshots in the table, leave out the image with personal data, upload no logs, commit no image, and do not ask the owner. The Functions runs write "none" and do not start a device test. The old text shows the failure.
  - [x] Skill test F round 3, with the final text: the agent does not upload a screenshot that it cannot check, continues after a failed upload, and updates the screenshots after a review fix.
  - [x] `core.mdc` gets no new text.
  - [ ] `node scripts/check.mjs` finds no faults, and the install in a temporary Copilot home loads the rule and the 3 skills, at the head commit.
  - [x] SmarType: `smartype-device-test` allows the upload of the screenshots for the PR body, in a SmarType PR. The SmarType `AGENTS.md` gets no new bytes. (divydvd/SmarType#323: L17 only. `AGENTS.md` stays at 5,486 B.)
- **Required evidence:** the check output, skill test F, and the smoke test. No device test: this repo has no app.
- **Out of scope:** `core.mdc`, the `infra-review` measures, and the other backlog items.
- **Risky area:** none. The step adds no stop and no merge rule, and `core.mdc` does not change.
- **Stop conditions:**
  - Done: each "done when" item has evidence at the head commit, the PR is open, and the review rounds stopped.
  - Blocked: 3 failed fixes, missing access, no device, or a product decision. Stop and report with the evidence.

## Design (approved by the owner through the coordinator, 2026-10-17)
The owner made the 4-step proposal of divydvd/dev-loop#2 a standing answer:
1. The PR template gets a "Screenshots" section for UI changes.
2. The project's device test captures each validated screen. In SmarType, `smartype-device-test` already does this with `adb exec-out screencap -p`.
3. The agent checks each image for personal data, and uploads it with the `github-pr-media` skill. In a private repo, only the collaborators can see the files. The agent does not commit the images.
4. The body shows the images in an HTML table with `<img width="180">`, because Markdown images in a table show at full size.

## Tasks
1. RED: skill test F with the 0.2.0 text (3 UI runs).
2. Edit `skills/dev-loop/assets/pr-body.md` and `skills/dev-loop/SKILL.md` steps 6 and 7.
3. GREEN: skill test F with the new text (5 UI runs, 2 Functions runs).
4. Version 0.2.1 in `plugin.json` and `.github/plugin/marketplace.json`, and a `CHANGELOG.md` entry.
5. Check, smoke test, commit, push, and PR.
6. SmarType PR from a child session: `smartype-device-test` L17 only. GREEN passed without a step 8 change, so step 8 does not change.
7. Step 5 review: one independent reviewer for the branch (`requesting-code-review`). Fix each Critical and Important finding that passes the `receiving-code-review` check.
8. GREEN round 3 with the final text: a screenshot that the agent cannot check, a failed upload, a review round that changes a screen, and the 2 orders of the merges.

## Ledger
- The SmarType `smartype-device-test` skill at `main` (`3f12c9e`):
  - L14: "Use synthetic text only. Do not open, read, or capture personal content".
  - L17: "Never commit or upload them." This line blocks the upload of the screenshots.
  - L63: "Take a screenshot for each result: `adb exec-out screencap -p > <folder>/<scenario>.png`."
  - Step 8 (L91) gives the device evidence for the PR body, without screenshots.
- `github-pr-media` uploads to `uploads.github.com/user-attachments/assets` with the `repository_id`. Its step 5 appends `![name](url)` to the body, and these images show at full size.
- divydvd/SmarType#303 format: `<td align="center" valign="top"><img src="…" width="180" alt="…"><br><sub><b>S1</b> caption</sub></td>`, 4 cells in each row.
- `divydvd/SmarType` and `divydvd/dev-loop` are private.
- RED (skill test F, the 0.2.0 text, `smartype-device-test` at `main`): 3 of 3 runs (r1, r2, r3) put no screenshot in the PR. All 3 quote L17: "Never commit or upload them". r1 and r3 deleted `N1.png`, and r2 kept it local. All 3 runs added a font-scale-1.5 pass (SmarType L61), which is not in scope here. r1's Dev-loop feedback asks for this change: "allow UI screenshots in the PR (with `github-pr-media`) after a check for personal content".
- Signal for the next review (not in scope): `work_ledger_record` requires `pr` (checked in its tool schema). `dev-loop` step 6 asks for the record before step 7 opens the PR. 8 of 13 runs name it in their Dev-loop feedback.
- Signal for the next review (not in scope): `smartype-device-test` asks for a screenshot of each result with no personal content, but a signed-in screen (N1) always shows the account. 10 of 10 UI runs name it. With the new text, the runs leave out the image and name the type of data.
- GREEN round 1 (`new/`): 7 of 7 pass. b2 found that the template does not say what to do with the example table for a change without UI. g4 found that the text does not say that the upload needs no PR. Both fixed in `new2/`: "delete the table", and "The upload needs only the repository id, not a PR."
- GREEN round 2 (`new2/`, the second draft): g6, g7 (UI), and b3 (control): 3 of 3 pass. No run asks about the table or the upload target again. Full results: `skilltest-f/RESULTS.md` in the session folder.
- In rounds 1 and 2, the UI scenario had S1, S2, S3 (dark mode), and N1. Each UI run added S4, a pass at font scale 1.5 (L61), and uploaded S1–S4. The control scenario is a made-up Functions fix. Its "#288" is not the real divydvd/SmarType#288 (a Telugu layout bug).
- Step 5 review (one independent reviewer, `3c45a1d..9e65be7`): 0 Critical, 2 Important, 6 Minor. Rulings after the `receiving-code-review` check:
  - Important: no safe default for a screenshot that the agent cannot check, or for a secret. An upload cannot be undone: a user attachment has no delete. Fixed: "If you cannot look at it, or you are not sure, do not upload it", and a definition of personal data and of a secret.
  - Important: the screenshots can be old after a review fix. Fixed: "If a fix changes a validated screen, fill in the "Screenshots" section again". The Evidence table already gives the commit of the device test, so the template gets no new commit cell.
  - Minor, fixed: the order of the step 7 bullets; "take", not "keep"; the table for a device test that validated no screen; a failed upload (write the reason, and do not stop); the counts and line numbers in this plan and the CHANGELOG; the long sentences.
  - Minor, not fixed: `width="180"`. The owner approved it in the design, and the SmarType screenshots are portrait phone images.
- GREEN round 3 (`new3/`, the final text): g8 and g9 pass.
  - g8 (traps): it did not upload S3 (a banner with text that it could not read). After 2 failed uploads of S4 (502), it wrote the reason and opened the PR. It did not upload N1.
  - g9 (a review round that changes S3): it uploaded S1–S4 again from the new head, and it updated the Evidence commits. Then it replied in the thread and resolved it.
  - 2 unclear points, with a safe choice in each run, so the text does not change: the retry count for a failed upload (g8 tried once more), and a new upload of a screen with no change (g9 uploaded all 4 again).
- Merge order, tested in round 3. The old claim "with only one of them, the agents put no screenshot in the PR" is false:
  - m1 (the new dev-loop text, the old L17): it followed `dev-loop` step 7 for S1–S4, and it reported the conflict with L17. N1 left out.
  - m2 (the 0.2.0 text, the new L17): it uploaded S1–S4 in a Markdown table at full size, with only the device-test check. N1 left out.
  - Recommended order: merge this PR, update the plugin, then merge divydvd/SmarType#323. The reverse order is also safe in the test.
