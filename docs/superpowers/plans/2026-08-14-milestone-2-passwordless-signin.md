# Milestone 2: Passwordless Sign-In — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user sign in with just their email address via a magic link sent
through Resend, using Auth.js (NextAuth v5) with the Prisma adapter, and prove
the whole flow works end-to-end.

**Architecture:** Auth.js needs the database-backed models its Prisma adapter
expects (`Account`, `Session`, `VerificationToken`, plus two new fields on
`User`) — these are added via a new migration, following the same Prisma 7
driver-adapter pattern from Milestone 1. A shared `lib/prisma.ts` singleton
replaces ad-hoc `PrismaClient` construction so Auth.js, and all future app
code, reuse one connection pool instead of creating a new one per request
(critical in Next.js dev mode, where hot-reload would otherwise exhaust Neon's
connection limit). Auth.js itself is configured in a root `auth.ts` file
(the current App Router convention), wired to Resend's email API for sending
magic links. No route protection/middleware is built yet — this milestone's
"testing" means proving a real sign-in round-trip works, which we verify by
displaying session status directly on the home page.

**Tech Stack:** Next.js 16.3.0 (App Router), TypeScript, Prisma 7 (driver
adapters), PostgreSQL via Neon, Auth.js v5 (`next-auth@beta`),
`@auth/prisma-adapter`, Resend.

**Spec:** [docs/superpowers/specs/2026-08-13-todo-app-design.md](../specs/2026-08-13-todo-app-design.md)

## Global Constraints

- Prisma 7 driver-adapter model continues from Milestone 1: `schema.prisma`'s
  `datasource` block stays `provider`-only; connections happen through
  `PrismaPg` adapter instances in code, not schema URLs.
- Auth.js env var names must match its own conventions exactly —
  `AUTH_SECRET` and `AUTH_RESEND_KEY` — not generic names like `RESEND_API_KEY`.
- Auth.js v5's App Router convention: a root `auth.ts` exports
  `{ handlers, auth, signIn, signOut }`; the route handler at
  `app/api/auth/[...nextauth]/route.ts` re-exports `{ GET, POST }` from it.
- Because a Prisma adapter is configured, Auth.js defaults to **database**
  session strategy (not JWT) — don't override this.
- **Uncertainty flag:** Resend's sandbox sender (`onboarding@resend.dev`)
  is documented as test-only, but its exact recipient restrictions for
  unverified accounts weren't confirmed from current docs. Task 3 has you
  check this directly in your Resend dashboard rather than assuming.
- No middleware/route protection in this milestone — that's deferred until
  Milestone 3+ when there are actual list/item routes to protect.

---

### Task 1: Extend the schema for Auth.js and create a shared Prisma client

**Files:**
- Modify: `prisma/schema.prisma` (add `Account`, `Session`, `VerificationToken`; extend `User`)
- Create: `lib/prisma.ts` (shared `PrismaClient` singleton)

**Interfaces:**
- Consumes: `DATABASE_URL` env var, `PrismaPg` adapter pattern from Milestone 1.
- Produces: `Account`, `Session`, `VerificationToken` tables in the database;
  a `prisma` export from `lib/prisma.ts` that Task 2's `auth.ts` (and all
  future app code) imports instead of constructing its own client.

- [ ] **Step 1: Add the Auth.js models and extend `User`**

  In `prisma/schema.prisma`, replace the existing `User` model with this
  extended version, and add the three new models below it:

  ```prisma
  model User {
    id            String       @id @default(cuid())
    email         String       @unique
    name          String?
    emailVerified DateTime?
    image         String?
    memberships   ListMember[]
    createdLists  List[]       @relation("ListCreator")
    accounts      Account[]
    sessions      Session[]
  }

  model Account {
    id                String  @id @default(cuid())
    userId            String
    type              String
    provider          String
    providerAccountId String
    refresh_token     String? @db.Text
    access_token      String? @db.Text
    expires_at        Int?
    token_type        String?
    scope             String?
    id_token          String? @db.Text
    session_state     String?
    user              User    @relation(fields: [userId], references: [id], onDelete: Cascade)

    @@unique([provider, providerAccountId])
  }

  model Session {
    id           String   @id @default(cuid())
    sessionToken String   @unique
    userId       String
    expires      DateTime
    user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  }

  model VerificationToken {
    identifier String
    token      String
    expires    DateTime

    @@unique([identifier, token])
  }
  ```

  **Side quest:** `Account` isn't used by anything in this app yet — we have
  no OAuth providers, only email magic links. It's still required because
  it's part of the Prisma adapter's fixed contract with Auth.js; leaving it
  out would break the adapter even though no rows will ever be written to it
  for now.

- [ ] **Step 2: Run the migration**

  ```bash
  npx prisma migrate dev --name add_auth_models
  npx prisma generate
  ```

  Expected: migration applies cleanly, ending with "Your database is now in
  sync with your schema," and the client regenerates without errors.

- [ ] **Step 3: Create the shared Prisma client singleton**

  Create `lib/prisma.ts`:

  ```typescript
  import { PrismaClient } from "../app/generated/prisma/client";
  import { PrismaPg } from "@prisma/adapter-pg";

  const globalForPrisma = globalThis as unknown as {
    prisma?: PrismaClient;
  };

  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });

  export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });

  if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma = prisma;
  }
  ```

  **Side quest:** Next.js's dev server hot-reloads your code on every save,
  which would normally re-run this file and create a brand new
  `PrismaClient` (and a brand new connection pool) each time — quickly
  exhausting Neon's connection limit. Stashing the instance on
  `globalThis` survives hot-reloads in development, while production
  (where the process doesn't hot-reload) just creates one client normally.

- [ ] **Step 4: Verify and commit**

  ```bash
  npx prisma validate
  git add prisma/schema.prisma prisma/migrations lib/prisma.ts
  git commit -m "Add Auth.js models and shared Prisma client"
  ```

---

### Task 2: Wire up Auth.js core with the Prisma adapter

**Files:**
- Create: `auth.ts` (project root)
- Create: `app/api/auth/[...nextauth]/route.ts`
- Modify: `package.json` (adds `next-auth`, `@auth/prisma-adapter`)
- Modify: `.env.local` (adds `AUTH_SECRET` — created by a CLI command, gitignored)

**Interfaces:**
- Consumes: `prisma` export from `lib/prisma.ts` (Task 1).
- Produces: `{ handlers, auth, signIn, signOut }` exported from `auth.ts` —
  Task 3's sign-in/sign-out UI and the home page both import from here.

- [ ] **Step 1: Install Auth.js and the Prisma adapter**

  ```bash
  npm install next-auth@beta @auth/prisma-adapter
  ```

- [ ] **Step 2: Generate `AUTH_SECRET`**

  ```bash
  npx auth secret
  ```

  This writes an `AUTH_SECRET` line into `.env.local` automatically (a new
  file — it's covered by the existing `.env*` gitignore rule, same as
  `.env`). Auth.js uses this to encrypt session tokens and email
  verification hashes.

- [ ] **Step 3: Create `auth.ts` with the Prisma adapter (no providers yet)**

  Create `auth.ts` at the project root:

  ```typescript
  import NextAuth from "next-auth";
  import { PrismaAdapter } from "@auth/prisma-adapter";
  import { prisma } from "@/lib/prisma";

  export const { handlers, auth, signIn, signOut } = NextAuth({
    adapter: PrismaAdapter(prisma),
    providers: [],
  });
  ```

- [ ] **Step 4: Create the route handler**

  Create `app/api/auth/[...nextauth]/route.ts`:

  ```typescript
  import { handlers } from "@/auth";
  export const { GET, POST } = handlers;
  ```

- [ ] **Step 5: Verify the app still builds**

  ```bash
  npm run build
  ```

  Expected: build succeeds (an empty `providers` array is valid — there's
  just nothing to sign in with yet, which Task 3 fixes).

- [ ] **Step 6: Commit**

  ```bash
  git add auth.ts app/api/auth package.json package-lock.json
  git commit -m "Wire up Auth.js core with Prisma adapter"
  ```

---

### Task 3: Add the Resend provider and prove sign-in works end-to-end

**Files:**
- Modify: `auth.ts` (add the Resend provider)
- Modify: `.env` (adds `AUTH_RESEND_KEY` — gitignored)
- Modify: `.env.example` (documents the new variable with a placeholder)
- Create: `app/sign-in-button.tsx`
- Create: `app/sign-out-button.tsx`
- Modify: `app/page.tsx` (show session status, render one button or the other)

**Interfaces:**
- Consumes: `{ signIn, signOut, auth }` from `auth.ts` (Task 2).
- Produces: a working magic-link sign-in flow, verified manually by you in
  the browser — later milestones' list/item pages will call `auth()` the
  same way this task's home page does, to find out who's signed in.

- [ ] **Step 1: Create a Resend account and get an API key**

  1. Go to https://resend.com and sign up.
  2. In the dashboard, create an API key (Settings → API Keys).
  3. **Check the Domains page** in your Resend dashboard to see what
     sending restrictions apply to your account before a custom domain is
     verified — specifically, whether the sandbox sender
     `onboarding@resend.dev` can email your own inbox, or only Resend's
     synthetic test addresses. This determines what email address you can
     realistically test with in Step 5 below.

- [ ] **Step 2: Add the API key to `.env`**

  ```bash
  AUTH_RESEND_KEY="paste-your-resend-api-key-here"
  ```

  Append this line to your existing `.env` file (alongside `DATABASE_URL`
  and `DIRECT_URL`).

- [ ] **Step 3: Update `.env.example`**

  Add to `.env.example`:

  ```bash
  AUTH_RESEND_KEY="re_xxxxxxxxxxxxxxxxxxxxxxxx"
  ```

- [ ] **Step 4: Add the Resend provider to `auth.ts`**

  Update `auth.ts`:

  ```typescript
  import NextAuth from "next-auth";
  import Resend from "next-auth/providers/resend";
  import { PrismaAdapter } from "@auth/prisma-adapter";
  import { prisma } from "@/lib/prisma";

  export const { handlers, auth, signIn, signOut } = NextAuth({
    adapter: PrismaAdapter(prisma),
    providers: [
      Resend({
        apiKey: process.env.AUTH_RESEND_KEY,
        from: "onboarding@resend.dev",
      }),
    ],
  });
  ```

  **Side quest:** `from: "onboarding@resend.dev"` only works for testing.
  Once you're ready for family members to actually receive real magic-link
  emails (not just you), you'll need to verify your own domain in Resend
  and change this to an address on that domain — that's a later step, not
  needed for this milestone.

- [ ] **Step 5: Create the sign-in button component**

  Create `app/sign-in-button.tsx`:

  ```tsx
  import { signIn } from "@/auth";

  export function SignInButton() {
    return (
      <form
        action={async (formData) => {
          "use server";
          await signIn("resend", formData);
        }}
      >
        <input type="email" name="email" placeholder="you@example.com" required />
        <button type="submit">Send magic link</button>
      </form>
    );
  }
  ```

- [ ] **Step 6: Create the sign-out button component**

  Create `app/sign-out-button.tsx`:

  ```tsx
  import { signOut } from "@/auth";

  export function SignOutButton() {
    return (
      <form
        action={async () => {
          "use server";
          await signOut();
        }}
      >
        <button type="submit">Sign out</button>
      </form>
    );
  }
  ```

- [ ] **Step 7: Update the home page to show session status**

  Replace the contents of `app/page.tsx` with:

  ```tsx
  import { auth } from "@/auth";
  import { SignInButton } from "./sign-in-button";
  import { SignOutButton } from "./sign-out-button";

  export default async function Home() {
    const session = await auth();

    return (
      <main>
        {session?.user ? (
          <>
            <p>Signed in as {session.user.email}</p>
            <SignOutButton />
          </>
        ) : (
          <>
            <p>Not signed in</p>
            <SignInButton />
          </>
        )}
      </main>
    );
  }
  ```

- [ ] **Step 8: Test the full flow manually**

  ```bash
  npm run dev
  ```

  1. Open `http://localhost:3000` — you should see "Not signed in" and the
     email form.
  2. Enter the email address you confirmed works in Step 1, submit.
  3. Check that inbox for an email from Resend with a sign-in link.
  4. Click the link — you should land back on `http://localhost:3000`
     showing "Signed in as [your email]".
  5. Click "Sign out" — you should see "Not signed in" again.

  If step 2 fails (no email arrives), double check `AUTH_RESEND_KEY` is
  correct and that the recipient address is one your Resend account is
  actually allowed to send to (see Step 1's dashboard check).

- [ ] **Step 9: Confirm the database recorded the sign-in**

  ```bash
  npx prisma studio
  ```

  Check that a row now exists in `User` (with your email) and `Session`
  (with a matching `userId`). This confirms the Prisma adapter is actually
  persisting sign-ins, not just Auth.js's in-memory behavior looking like
  it worked.

- [ ] **Step 10: Commit**

  ```bash
  git add auth.ts .env.example app/sign-in-button.tsx app/sign-out-button.tsx app/page.tsx
  git commit -m "Add Resend provider and verify end-to-end sign-in"
  ```

---

## Definition of Done

- [ ] `Account`, `Session`, `VerificationToken` tables exist; `User` has `emailVerified`/`image`.
- [ ] `lib/prisma.ts` provides one shared Prisma client, used by `auth.ts`.
- [ ] `auth.ts` exports `{ handlers, auth, signIn, signOut }` with the Prisma adapter and Resend provider configured.
- [ ] Manually verified: submitting your email sends a real magic-link email, clicking it signs you in, and the home page reflects signed-in/signed-out state correctly.
- [ ] A real `User` and `Session` row exist in the database after signing in.
- [ ] `AUTH_SECRET` and `AUTH_RESEND_KEY` are set locally and not committed; `.env.example` documents the new variable.
