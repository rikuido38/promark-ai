import { login, signup } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { BotMessageSquare } from "lucide-react";
import Image from "next/image";

export default async function LoginPage(props: {
  searchParams: Promise<{ error?: string }>;
}) {
  const searchParams = await props.searchParams;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-muted/40 px-4 py-12 sm:px-6 lg:px-8">
      <div className="grid grid-cols-1 gap-8">
        <div className="flex flex-col items-center justify-center">
          <Image
            src="/promark-logo-label.svg"
            alt="Promark AI Logo"
            width={250}
            height={20}
            className="object-contain"
          />
          <p className="mt-2 text-center text-md text-muted-foreground">
            Where deep insight meets instant execution
          </p>
        </div>

        <Card className="w-full border-none shadow-xl shadow-blue-900/5">
          <CardHeader>
            <CardTitle className="text-xl">Sign In</CardTitle>
            <CardDescription>
              Enter your email below to login to your account
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={login} className="space-y-4">
              <div className="space-y-2 relative">
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
                  required
                  placeholder="m@example.com"
                />
              </div>
              <div className="space-y-2 relative">
                <label
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  htmlFor="password"
                >
                  Password
                </label>
                <Input id="password" name="password" type="password" required />
              </div>

              {searchParams?.error && (
                <div className="text-sm font-medium text-destructive mt-2 text-center">
                  {searchParams.error}
                </div>
              )}

              <div className="mt-6 flex flex-col gap-2">
                <Button
                  type="submit"
                  className="w-full bg-blue-600 hover:bg-blue-700"
                >
                  Log In
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
