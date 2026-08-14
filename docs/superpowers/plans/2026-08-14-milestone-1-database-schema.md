# Milestone 1: Database Schema — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a free Neon Postgres database and give the app a working,
migrated Prisma schema for `User`, `List`, `ListMember`, and `Item`.

**Architecture:** Prisma connects to Neon over two URLs — a pooled
`DATABASE_URL` for normal app queries and a direct `DIRECT_URL` for running
migrations (Neon's connection pooler doesn't support the advisory locks
`prisma migrate` needs). The schema is defined in `prisma/schema.prisma`,
applied with `prisma migrate dev`, and verified with a smoke-test script that
exercises every model and relation end-to-end — there's no application code
yet, so "testing" here means proving the schema and migration actually work
against the real database, not unit-testing logic.

**Tech Stack:** Next.js 16.3.0 (App Router), TypeScript, Prisma ORM,
PostgreSQL via Neon, Node v24, npm.

**Spec:** [docs/superpowers/specs/2026-08-13-todo-app-design.md](../specs/2026-08-13-todo-app-design.md)

## Global Constraints

- Package manager is npm (repo has `package-lock.json`) — don't introduce
  yarn/pnpm.
- `.env*` is already gitignored — never commit real credentials; commit a
  `.env.example` instead.
- Model fields must match the spec exactly: `User(id, email, name)`,
  `List(id, title, createdAt, createdBy)`, `ListMember(id, listId, userId,
  createdAt)` with a unique `(listId, userId)` constraint, `Item(id, listId,
  text, reminderAt, snoozedUntil, completed, createdAt)`.
- `List.createdBy` is display-only, per spec — it must NOT be used for
  access control anywhere later; access is always through `ListMember`.
- Milestone 2 (Auth.js) will extend `User` with `emailVerified`/`image` and
  add `Account`/`Session`/`VerificationToken` models required by the Auth.js
  Prisma adapter. That's out of scope here — don't add them now.
- This project is on Prisma 7 (`prisma@^7.9.1`), which defaults to the newer
  `prisma-client` generator with a custom `output` path (`app/generated/prisma`)
  instead of the older default of generating into `node_modules/@prisma/client`.
  Every import of `PrismaClient` in this plan and beyond must point at
  `app/generated/prisma`, not `@prisma/client`.

---

### Task 1: Create the Neon database and connect Prisma to it

**Files:**
- Create: `prisma/schema.prisma` (via `prisma init`)
- Create: `.env` (via `prisma init`, then hand-edited — gitignored, never committed)
- Create: `.env.example` (committed — documents required vars with no real values)
- Modify: `package.json` (adds `prisma` and `@prisma/client` as dependencies)

**Interfaces:**
- Produces: a reachable Postgres database; `DATABASE_URL` and `DIRECT_URL`
  environment variables; an empty `prisma/schema.prisma` with the
  `datasource`/`generator` blocks that Task 2 will add models into.

- [ ] **Step 1: Create a free Neon project**

  1. Go to https://neon.tech and sign up (or sign in).
  2. Create a new project — name it `to-do-app`.
  3. On the project dashboard, click **Connect** (or **Connection Details**).
  4. Make sure **Connection pooling** is toggled **on**, and copy that
     connection string — this is your `DATABASE_URL`. It contains
     `-pooler` in the hostname, e.g.
     `postgresql://user:password@ep-example-123456-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require`.
  5. Toggle **Connection pooling off** (same dialog) and copy that string
     too — this is your `DIRECT_URL`. Same as above but without `-pooler`
     in the hostname.

  **Side quest:** Neon's pooler is PgBouncer in "transaction mode." Prisma's
  migration engine needs a session-level advisory lock to make sure two
  migrations don't run at once, and PgBouncer's transaction mode can't hold
  that lock across statements. So migrations must go over the *direct*
  connection, while your app's everyday queries use the *pooled* one (which
  scales far better for serverless/many-short-connections workloads like
  Vercel). You'll see this pattern — one pooled URL, one direct URL — in
  most Neon + Prisma + Vercel setups.

- [ ] **Step 2: Install Prisma and initialize it in the project**

  ```bash
  cd to-do-app
  npm install prisma --save-dev
  npm install @prisma/client
  npx prisma init --datasource-provider postgresql
  ```

  This creates `prisma/schema.prisma` (with empty `generator`/`datasource`
  blocks and no models yet) and a `.env` file with a placeholder
  `DATABASE_URL`.

- [ ] **Step 3: Fill in the real connection strings**

  Open `.env` and replace its contents with:

  ```bash
  DATABASE_URL="paste-your-pooled-connection-string-here"
  DIRECT_URL="paste-your-direct-connection-string-here"
  ```

  Then update the `datasource` block in `prisma/schema.prisma` to use both
  (leave the `generator` block above it exactly as `prisma init` created it —
  Prisma 7's `prisma-client` generator with a custom `output` path is
  expected and correct):

  ```prisma
  datasource db {
    provider  = "postgresql"
    url       = env("DATABASE_URL")
    directUrl = env("DIRECT_URL")
  }
  ```

- [ ] **Step 3b: Gitignore the generated Prisma client**

  Prisma 7's generator writes the client into `app/generated/prisma/` inside
  the project (not hidden away in `node_modules` like older versions did).
  It's build output — regenerated by `prisma generate`/`migrate dev` and
  contains platform-specific native binaries — so it shouldn't be committed.
  Add this line to `.gitignore`:

  ```
  # prisma generated client
  /app/generated/
  ```

- [ ] **Step 4: Create `.env.example` so the required vars are documented in git**

  ```bash
  DATABASE_URL="postgresql://user:password@ep-xxxxx-pooler.region.aws.neon.tech/neondb?sslmode=require"
  DIRECT_URL="postgresql://user:password@ep-xxxxx.region.aws.neon.tech/neondb?sslmode=require"
  ```

  Save this as `.env.example` in the project root (this file has no real
  secrets, so it's safe to commit).

- [ ] **Step 5: Verify the connection**

  ```bash
  npx prisma db pull
  ```

  Expected: the command finishes without a connection error. Since the
  database has no tables yet, Prisma may report something like "the
  introspected database was empty" (error code `P4001`) — that's expected
  and fine; it proves the connection itself succeeded. What you should
  *not* see is `P1001` ("Can't reach database server") or `P1000`
  ("Authentication failed") — if you see either, re-check the connection
  strings from Step 3.

- [ ] **Step 6: Commit**

  ```bash
  git add prisma/schema.prisma .env.example .gitignore package.json package-lock.json
  git commit -m "Add Prisma, connect to Neon database"
  ```

  Note: `.env` is intentionally not staged — `.env*` is already in
  `.gitignore`, so `git add` won't pick it up even with a broader pattern.

---

### Task 2: Define the Prisma schema for User, List, ListMember, and Item

**Files:**
- Modify: `prisma/schema.prisma`

**Interfaces:**
- Consumes: `datasource`/`generator` blocks from Task 1.
- Produces: four models — `User`, `List`, `ListMember`, `Item` — with the
  exact field names and relations Task 3's smoke test and all future
  application code will import from `app/generated/prisma` (this project's
  Prisma 7 generator output path, not the older `@prisma/client`).

- [ ] **Step 1: Add the four models to `prisma/schema.prisma`**

  Append below the existing `datasource`/`generator` blocks:

  ```prisma
  model User {
    id           String       @id @default(cuid())
    email        String       @unique
    name         String?
    memberships  ListMember[]
    createdLists List[]       @relation("ListCreator")
  }

  model List {
    id        String       @id @default(cuid())
    title     String
    createdAt DateTime     @default(now())
    createdBy String
    creator   User         @relation("ListCreator", fields: [createdBy], references: [id])
    members   ListMember[]
    items     Item[]
  }

  model ListMember {
    id        String   @id @default(cuid())
    listId    String
    userId    String
    createdAt DateTime @default(now())
    list      List     @relation(fields: [listId], references: [id], onDelete: Cascade)
    user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)

    @@unique([listId, userId])
  }

  model Item {
    id           String    @id @default(cuid())
    listId       String
    text         String
    reminderAt   DateTime
    snoozedUntil DateTime?
    completed    Boolean   @default(false)
    createdAt    DateTime  @default(now())
    list         List      @relation(fields: [listId], references: [id], onDelete: Cascade)
  }
  ```

  **Side quest:** `onDelete: Cascade` on `ListMember` and `Item` means
  deleting a `List` automatically deletes its members and items with it, at
  the database level — you don't have to remember to delete them manually
  in application code later. `@@unique([listId, userId])` is what makes
  "presence of a `ListMember` row = access" work correctly: it physically
  prevents the same user from being added to the same list twice.

- [ ] **Step 2: Validate and format the schema**

  ```bash
  npx prisma format
  npx prisma validate
  ```

  Expected: `prisma format` rewrites the file with consistent indentation
  (no content change), and `prisma validate` prints `The schema at
  prisma/schema.prisma is valid`.

- [ ] **Step 3: Commit**

  ```bash
  git add prisma/schema.prisma
  git commit -m "Define User, List, ListMember, and Item models"
  ```

---

### Task 3: Run the first migration and verify it with a smoke test

**Files:**
- Create: `prisma/migrations/<timestamp>_init/migration.sql` (generated by Prisma — do not hand-edit)
- Create: `scripts/smoke-test-schema.ts`
- Modify: `package.json` (adds `tsx` dev dependency and a `db:smoke-test` script)

**Interfaces:**
- Consumes: the four models from Task 2; `DATABASE_URL`/`DIRECT_URL` from Task 1.
- Produces: applied migration in the real Neon database; a repeatable
  `npm run db:smoke-test` command that later milestones can reuse as a
  quick "is the DB actually working" check.

- [ ] **Step 1: Run the migration**

  ```bash
  npx prisma migrate dev --name init
  ```

  Expected output ends with something like:
  ```
  Your database is now in sync with your schema.
  ✔ Generated Prisma Client
  ```

  This does three things in one command: creates a SQL migration file
  under `prisma/migrations/`, applies it to your Neon database (creating
  the `User`, `List`, `ListMember`, and `Item` tables), and generates the
  typed Prisma Client into `app/generated/prisma/` (this project's Prisma 7
  output path — see Global Constraints).

- [ ] **Step 2: Install `tsx` so you can run TypeScript scripts directly**

  ```bash
  npm install tsx --save-dev
  ```

  **Side quest:** normally TypeScript needs a compile step (`tsc`) before
  Node can run it. `tsx` compiles on the fly, which is convenient for
  one-off scripts like this smoke test (and later, database seed scripts)
  where setting up a full build step would be overkill.

- [ ] **Step 3: Write the smoke-test script**

  Create `scripts/smoke-test-schema.ts`:

  ```typescript
  import { PrismaClient } from "../app/generated/prisma";

  const prisma = new PrismaClient();

  async function main() {
    const user = await prisma.user.create({
      data: { email: "smoke-test@example.com", name: "Smoke Test" },
    });
    console.log("Created user:", user.id);

    const list = await prisma.list.create({
      data: { title: "Smoke Test List", createdBy: user.id },
    });
    console.log("Created list:", list.id);

    const membership = await prisma.listMember.create({
      data: { listId: list.id, userId: user.id },
    });
    console.log("Created membership:", membership.id);

    const item = await prisma.item.create({
      data: { listId: list.id, text: "Buy milk", reminderAt: new Date() },
    });
    console.log("Created item:", item.id);

    const listWithRelations = await prisma.list.findUniqueOrThrow({
      where: { id: list.id },
      include: { members: true, items: true, creator: true },
    });

    if (listWithRelations.members.length !== 1) {
      throw new Error(
        `Expected 1 member, got ${listWithRelations.members.length}`
      );
    }
    if (listWithRelations.items.length !== 1) {
      throw new Error(
        `Expected 1 item, got ${listWithRelations.items.length}`
      );
    }
    if (listWithRelations.creator.id !== user.id) {
      throw new Error("List creator relation did not resolve correctly");
    }
    console.log("Relations verified: 1 member, 1 item, creator resolved.");

    await prisma.item.delete({ where: { id: item.id } });
    await prisma.listMember.delete({ where: { id: membership.id } });
    await prisma.list.delete({ where: { id: list.id } });
    await prisma.user.delete({ where: { id: user.id } });
    console.log("Cleanup complete. Schema smoke test PASSED.");
  }

  main()
    .catch((err) => {
      console.error("Schema smoke test FAILED:", err);
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
  ```

- [ ] **Step 4: Add an npm script and run it**

  In `package.json`, add to `"scripts"`:

  ```json
  "db:smoke-test": "tsx scripts/smoke-test-schema.ts"
  ```

  Run it:

  ```bash
  npm run db:smoke-test
  ```

  Expected output:
  ```
  Created user: <some-id>
  Created list: <some-id>
  Created membership: <some-id>
  Created item: <some-id>
  Relations verified: 1 member, 1 item, creator resolved.
  Cleanup complete. Schema smoke test PASSED.
  ```

  If it fails, the error will point at which model/relation is broken —
  fix `prisma/schema.prisma`, rerun `npx prisma migrate dev --name fix`,
  and rerun the smoke test.

- [ ] **Step 5: Confirm the database is clean after the smoke test**

  ```bash
  npx prisma studio
  ```

  Prisma Studio opens in your browser at `http://localhost:5555`. Check
  that `User`, `List`, `ListMember`, and `Item` tables exist and are all
  empty (the smoke test cleaned up after itself). Close it with Ctrl+C in
  the terminal when done.

- [ ] **Step 6: Commit**

  ```bash
  git add prisma/migrations scripts/smoke-test-schema.ts package.json package-lock.json
  git commit -m "Run initial migration and add schema smoke test"
  ```

---

## Definition of Done

- [ ] Neon project exists and is reachable from this project via `DATABASE_URL`/`DIRECT_URL`.
- [ ] `prisma/schema.prisma` defines `User`, `List`, `ListMember`, `Item` matching the spec exactly.
- [ ] `npx prisma migrate dev` has been run and the migration is committed.
- [ ] `npm run db:smoke-test` passes, proving creates/reads/relations/deletes all work against the real database.
- [ ] `.env` holds real credentials and is not committed; `.env.example` is committed with placeholders.
