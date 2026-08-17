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
