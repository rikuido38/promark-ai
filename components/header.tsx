import { Bell, ChevronDown, Plus, Briefcase, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import Link from "next/link";

import { getUser } from "@/utils/cognito/auth";
import { getDb } from "@/utils/mongodb/client";
import { signout } from "@/app/login/actions";

const FALLBACK_COLORS = [
  "bg-violet-600",
  "bg-blue-600",
  "bg-emerald-600",
  "bg-rose-600",
  "bg-amber-600",
  "bg-cyan-600",
  "bg-pink-600",
  "bg-indigo-600",
];

function nameToColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (name.codePointAt(i) ?? 0) + ((hash << 5) - hash);
  }
  return FALLBACK_COLORS[Math.abs(hash) % FALLBACK_COLORS.length];
}

export async function Header() {
  const user = await getUser();
  let avatarUrl: string | null = null;
  let displayName = user?.name ?? user?.email?.split("@")[0] ?? "User";

  if (user?.id) {
    const db = await getDb();
    const profile = await db
      .collection<{ name?: string; avatar_url?: string | null }>("user_profiles")
      .findOne({ _id: user.id }, { projection: { name: 1, avatar_url: 1 } });
    if (profile?.name) displayName = profile.name;
    avatarUrl = profile?.avatar_url ?? null;
  }

  const initials = displayName
    .split(" ")
    .map((w) => w[0])
    .join("")
    .substring(0, 2)
    .toUpperCase();

  const fallbackColor = nameToColor(displayName);

  return (
    <header className="flex h-16 items-center border-b bg-background px-6">
      <div className="flex flex-1 items-center gap-4"></div>

      <div className="flex items-center gap-4 ml-auto">
        {/* Create dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger className="inline-flex items-center gap-1.5 h-9 px-3 text-sm font-medium rounded-md bg-primary text-primary-foreground shadow-xs hover:bg-primary/90 transition-colors outline-none cursor-pointer">
            <Plus className="h-4 w-4" />
            Create
            <ChevronDown className="h-3.5 w-3.5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <Link href="/project/new" className="w-full outline-none block">
              <DropdownMenuItem className="w-full cursor-pointer gap-2">
                <Briefcase className="h-4 w-4" />
                New Project
              </DropdownMenuItem>
            </Link>
            <Link href="/studio/illustration" className="w-full outline-none block">
              <DropdownMenuItem className="w-full cursor-pointer gap-2">
                <Sparkles className="h-4 w-4" />
                Illustration
              </DropdownMenuItem>
            </Link>
          </DropdownMenuContent>
        </DropdownMenu>
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
              {avatarUrl && <AvatarImage src={avatarUrl} alt={displayName} />}
              <AvatarFallback className={`${fallbackColor} text-white font-medium text-xs`}>
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="flex flex-col items-start leading-none hidden sm:flex">
              <span className="text-sm font-semibold mb-1 text-foreground">
                {displayName}
              </span>
            </div>
            <ChevronDown className="h-4 w-4 text-muted-foreground ml-2 hidden sm:block" />
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56" align="end">
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
