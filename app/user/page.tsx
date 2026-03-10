import { updateProfile } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";

export default async function UserProfilePage(props: {
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const searchParams = await props.searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const displayName = user.user_metadata?.display_name || "";

  return (
    <div className="flex-1 p-8">
      <div className="max-w-2xl space-y-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">User Profile</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage your personal information and display name.
          </p>
        </div>

        <Card className="border shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">Personal Information</CardTitle>
            <CardDescription>
              Update your display name to how you would like it to appear in the app.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={updateProfile} className="space-y-4 max-w-md">
              <div className="space-y-2">
                <label
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  htmlFor="email"
                >
                  Email
                </label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  value={user.email}
                  disabled
                  className="bg-muted"
                />
              </div>
              <div className="space-y-2">
                <label
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  htmlFor="display_name"
                >
                  Display Name
                </label>
                <Input
                  id="display_name"
                  name="display_name"
                  type="text"
                  defaultValue={displayName}
                  placeholder="e.g. John Doe"
                  required
                />
              </div>

              {searchParams?.error && (
                <div className="text-sm font-medium text-destructive mt-2">
                  {searchParams.error}
                </div>
              )}
              {searchParams?.success && (
                <div className="text-sm font-medium text-emerald-600 mt-2">
                  Profile updated successfully!
                </div>
              )}

              <div className="pt-4 flex">
                <Button type="submit" className="bg-blue-600 hover:bg-blue-700">
                  Save Changes
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
