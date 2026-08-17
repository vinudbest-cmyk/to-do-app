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
