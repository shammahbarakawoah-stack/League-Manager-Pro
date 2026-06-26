import { Link, useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { LogOut, Menu, Trophy, ShieldAlert, User, Home, Calendar, ListChecks, Medal, Shield } from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { NotificationBell } from "@/components/NotificationBell";
import { useState } from "react";

export function NavBar() {
  const { userData, isAdmin, signOut } = useAuth();
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  const links = [
    { href: "/", label: "Dashboard", icon: Home },
    { href: "/leagues", label: "Leagues", icon: Trophy },
    { href: "/fixtures", label: "Fixtures", icon: Calendar },
    { href: "/results", label: "Results", icon: ListChecks },
    { href: "/standings", label: "Standings", icon: Medal },
    { href: "/profile", label: "My Teams", icon: Shield },
  ];
  if (isAdmin) links.push({ href: "/admin", label: "Admin", icon: ShieldAlert });

  const handleSignOut = async () => { setMobileOpen(false); await signOut(); };
  const getInitials = (name: string) => (name ?? "").substring(0, 2).toUpperCase() || "EF";

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Trophy className="h-5 w-5" />
            </div>
            <span className="hidden font-bold tracking-tight text-foreground md:inline-block">eFootball League</span>
          </Link>
          <nav className="hidden md:flex items-center gap-1 text-sm font-medium">
            {links.map(link => {
              const Icon = link.icon;
              return (
                <Link key={link.href} href={link.href}
                  className={`flex items-center gap-2 rounded-md px-3 py-2 transition-colors hover:bg-accent hover:text-accent-foreground ${location === link.href ? "bg-accent text-accent-foreground" : "text-muted-foreground"}`}>
                  <Icon className="h-4 w-4" />{link.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center gap-2">
          {userData && <NotificationBell />}

          {userData && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative h-8 w-8 rounded-full border border-border">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={userData.photoURL} alt={userData.displayName} />
                    <AvatarFallback>{getInitials(userData.displayName)}</AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56" align="end" forceMount>
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium leading-none">{userData.displayName}</p>
                    <p className="text-xs leading-none text-muted-foreground">{userData.email}</p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/profile" className="cursor-pointer w-full flex items-center">
                    <User className="mr-2 h-4 w-4" /><span>Profile & My Teams</span>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleSignOut} className="text-destructive focus:text-destructive cursor-pointer">
                  <LogOut className="mr-2 h-4 w-4" /><span>Log out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[300px] sm:w-[400px] flex flex-col">
              <div className="flex items-center gap-2 mb-6">
                <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
                  <Trophy className="h-5 w-5" />
                </div>
                <span className="font-bold tracking-tight">eFootball League</span>
              </div>
              {userData && (
                <div className="flex items-center gap-3 mb-5 p-3 rounded-lg bg-muted/40 border border-border/50">
                  <Avatar className="h-10 w-10 border border-border">
                    <AvatarImage src={userData.photoURL} />
                    <AvatarFallback>{getInitials(userData.displayName)}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate">{userData.displayName}</p>
                    <p className="text-xs text-muted-foreground truncate">{userData.email}</p>
                  </div>
                </div>
              )}
              <nav className="flex flex-col gap-1 flex-1">
                {links.map(link => {
                  const Icon = link.icon;
                  return (
                    <Link key={link.href} href={link.href} onClick={() => setMobileOpen(false)}
                      className={`flex items-center gap-3 rounded-md px-3 py-2.5 text-base transition-colors hover:bg-accent hover:text-accent-foreground ${location === link.href ? "bg-accent text-accent-foreground font-semibold" : "text-muted-foreground"}`}>
                      <Icon className="h-5 w-5" />{link.label}
                    </Link>
                  );
                })}
              </nav>
              <div className="mt-auto pt-4 border-t border-border">
                <button onClick={handleSignOut}
                  className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-base text-destructive transition-colors hover:bg-destructive/10">
                  <LogOut className="h-5 w-5" />Log out
                </button>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
