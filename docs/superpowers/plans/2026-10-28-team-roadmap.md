# Team roadmap implementation plan

> For agentic workers: use superpowers:executing-plans to implement the plan.

**Goal:** Publish the existing Russian roadmap on GitHub Pages with shared editing.
**Architecture:** Static HTML/CSS/JS on GitHub Pages; a Sites Worker stores the shared JSON document in R2. An unguessable edit-link token authorizes writes. Conditional writes reject stale edits. Both deployments remain private until the user approves public access.
**Tech stack:** Browser JavaScript, Cloudflare Worker/R2, Node test runner, GitHub Pages.
**Spec:** User-approved roadmap in /workspace/tbank-team-roadmap.html and the current request.

## Global constraints
- Preserve all ten tasks and distinguish suggested assignments from confirmed ones.
- Preserve the ambiguity between 2 and 5 November.
- Never put edit keys, GitHub credentials, or Sites credentials in source.
- Shared changes must survive reloads and become visible on other devices.
- Publication approval is required after automatic review rejected public repository creation.

## Review focus
- Missing or invalid edit credentials cannot write.
- Two editors using the same revision cannot silently overwrite one another.
- Invalid dates, empty titles and malformed task data cannot break the timeline.
- Network failures preserve the unsaved form and never claim a save succeeded.
- Narrow screens keep task controls, dates and form fields accessible.

## Task 1: Shared document service
- [ ] Write request-level tests for authentication, save/read, stale updates, malformed input and CORS.
- [ ] Observe failures with the scaffold handler.
- [ ] Implement /api/roadmap GET/PUT and /api/access GET, validation and conditional R2 writes.
- [ ] Run the tests; include the service source and tests in the private repository.

## Task 2: Editable roadmap
- [ ] Export the existing task data; keep the timeline and task detail hierarchy.
- [ ] Add a task editor, status, notes, add-task action and project settings.
- [ ] Load shared state, poll for updates, preserve dirty drafts, show save and conflict errors.
- [ ] Check syntax, then exercise edit/save/reload and mobile layout in the managed preview.

## Task 3: Publication preparation
- [ ] Build and privately deploy the service and preview; verify stored state.
- [ ] Push source to the private alex-pletnev/tbank-team-roadmap repository.
- [ ] Present the prepared result and request public-publication approval.
- [ ] After approval, enable public API access and GitHub Pages; verify the deployed URL.
