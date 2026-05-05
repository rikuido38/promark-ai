"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { signIn, signOut } from "@/utils/cognito/auth";

export async function login(formData: FormData) {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  try {
    await signIn(email, password);
  } catch (err) {
    console.error("[login] Cognito error:", err);
    redirect("/login?error=Wrong email or password");
  }

  revalidatePath("/", "layout");
  redirect("/");
}

export async function signup(_formData: FormData) {
  // Cognito user creation is handled via AWS Console or admin SDK.
  // Self-service sign-up can be added here if the User Pool allows it.
  redirect("/login?error=Sign up is not available. Please contact your administrator.");
}

export async function signout() {
  await signOut();
  redirect("/login");
}

