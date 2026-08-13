# To-Do App — Design Spec

## Overview

A learning project: a first full-stack app, built as a mentored pair-programming
exercise. The app is a to-do list manager shareable with family members via
passwordless email sign-in.

## Tech Stack

- **Frontend + Backend:** Next.js (App Router), React, TypeScript
- **Styling:** Tailwind CSS
- **Database:** PostgreSQL, hosted free on Neon
- **ORM:** Prisma
- **Auth:** Auth.js (NextAuth), passwordless magic-link email sign-in via Resend
- **Deployment:** Vercel, connected to GitHub, auto-deploys on push
- **Dev environment:** Windows, VS Code, PowerShell/Git Bash terminals

Rationale: a single language (JS/TS) across the whole app reduces
context-switching while learning. React/Next.js was chosen over Vue for its
larger ecosystem and AI-assistance support, and because the eventual app
wasn't decided yet when the stack was chosen (safer generalist pick).

## Features

- Create multiple to-do lists, each with a creation date-time
- Each list item has: text, a reminder date-time
- In-app pop-up/notification when an item is due (Phase 1); OS-level push
  notifications are a deferred stretch goal (Phase 2)
- Mark items complete
- Delete/discard items
- Snooze option (pushes reminder time forward)
- Responsive design (must work well on phone)
- Passwordless auth (magic link via email)
- Per-list sharing with family members (see Sharing Flow below)

## Data Model

### User
- `id`
- `email` (unique)
- `name`

### List
- `id`
- `title`
- `createdAt`
- `createdBy` (User id) — display only ("created by Mum"); **not** used for
  access control

### ListMember (join table)
- `id`
- `listId` (FK → List)
- `userId` (FK → User)
- `createdAt`
- Unique constraint on `(listId, userId)`
- Presence of a row grants full access: view/add/edit/complete/delete items,
  and add/remove other members. No `role` column — every member has equal
  permissions.
- The creator is automatically inserted as the first `ListMember` row when a
  list is created.

### Item
- `id`
- `listId` (FK → List)
- `text`
- `reminderAt`
- `snoozedUntil` (nullable)
- `completed` (boolean, default `false`)
- `createdAt`

## Sharing Flow

- A list member shares a list by entering another family member's email.
- The app looks up an existing `User` by that email.
  - **Found:** insert a `ListMember` row, granting access immediately.
  - **Not found** (they've never signed in): show a message that they need to
    sign in via magic link at least once before they can be added.
- Deliberately out of scope: proactively creating a `User` record for an
  email that hasn't signed in yet (no "invite an unregistered person" flow).

## Notification Approach (phased)

- **Phase 1 (build first):** in-app toast/banner shown while the app is open,
  comparing `reminderAt` (and `snoozedUntil` if set) to the current time
  client-side.
- **Phase 2 (stretch goal, later):** true OS-level push notifications via a
  service worker — deliberately deferred until the basics are solid.

## Build Roadmap

1. **Database schema** — set up Neon, define the Prisma schema above, run
   the first migration
2. **Passwordless sign-in** — wire up Auth.js + Resend, test end-to-end
   before anything else
3. **Create & view lists** — first full loop: form → API route → DB write →
   DB read → display
4. **Share a list with a family member** — add a member by email, list a
   list's members, leave/remove a member
5. **Create & view items** — same pattern as lists, one level deeper
6. **Complete, delete, snooze actions**
7. **In-app due notifications (Phase 1)**
8. **Responsive polish with Tailwind**
9. **Deploy & share the live link with family**

Auth is built before list/item features on purpose: every `List` and `Item`
is reached through a `User`'s membership, so building auth first avoids
retrofitting it later.

## Out of Scope (deferred or explicitly excluded)

- OS-level push notifications (Phase 2)
- Role-based permissions on shared lists (owner vs. collaborator) — all
  members are equal
- Inviting a family member who has never signed in (they must have an
  account first)

## Environment Notes

- Windows machine, VS Code, PowerShell/Git Bash terminals
- Git identity configured; `to-do-app` repo initialized locally (branch:
  `master`), scaffold committed as the initial commit
