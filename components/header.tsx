import { Bell, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuGroup,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import Link from "next/link";

import { getUser } from "@/utils/cognito/auth";
import { signout } from "@/app/login/actions";

export async function Header() {
  const user = await getUser();
  const userEmail = user?.email ?? "Unknown User";
  const userDisplayName = user?.name ?? userEmail.split("@")[0];
  const initials = userDisplayName.substring(0, 2).toUpperCase();

  return (
    <header className="flex h-16 items-center border-b bg-background px-6">
      <div className="flex flex-1 items-center gap-4"></div>

      <div className="flex items-center gap-4 ml-auto">
        <Button
          variant="ghost"
          size="icon"
          className="relative text-muted-foreground"
        >
          <Bell className="h-5 w-5" />
          <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-blue-600 border-2 border-background"></span>
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger className="relative flex items-center h-10 w-auto gap-3 hover:bg-muted/50 rounded-full px-2 cursor-pointer transition-colors outline-none">
            <Avatar className="h-8 w-8">
              <AvatarFallback className="bg-blue-600 text-white font-medium text-xs">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="flex flex-col items-start leading-none hidden sm:flex">
              <span className="text-sm font-semibold mb-1 text-foreground">
                {userDisplayName}
              </span>
            </div>
            <ChevronDown className="h-4 w-4 text-muted-foreground ml-2 hidden sm:block" />
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56" align="end">
            <DropdownMenuGroup>
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col gap-1">
                  <p className="text-sm font-medium leading-none">
                    {userDisplayName}
                  </p>
                  <p className="text-xs leading-none text-muted-foreground">
                    {userEmail}
                  </p>
                </div>
              </DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <Link href="/user" className="w-full outline-none block">
              <DropdownMenuItem className="w-full cursor-pointer">
                Settings
              </DropdownMenuItem>
            </Link>
            <form action={signout} className="w-full">
              <button type="submit" className="w-full text-left">
                <DropdownMenuItem className="w-full cursor-pointer">
                  Log out
                </DropdownMenuItem>
              </button>
            </form>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
