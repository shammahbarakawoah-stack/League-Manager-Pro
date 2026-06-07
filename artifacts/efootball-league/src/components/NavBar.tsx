import { Link, useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { LogOut, Menu, Trophy, ShieldAlert, User, Home, Calendar, ListChecks, Medal } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

export function NavBar() {
  const { userData, isAdmin, signOut } = useAuth();
  const [location] = useLocation();

  const links = [
    { href: "/", label: "Dashboard", icon: Home },
    { href: "/leagues", label: "Leagues", icon: Trophy },
    { href: "/fixtures", label: "Fixtures", icon: Calendar },
    { href: "/results", label: "Results", icon: ListChecks },
    { href: "/standings", label: "Standings", icon: Medal },
  ];

  if (isAdmin) {
    links.push({ href: "/admin", label: "Admin", icon: ShieldAlert });
  }

  const handleSignOut = async () => {
    await signOut();
  };

  const getInitials = (name: string) => name?.substring(0, 2).toUpperCase() || "EF";

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Trophy className="h-5 w-5" />
            </div>
            <span className="hidden font-bold tracking-tight text-foreground md:inline-block">
              eFootball League
            </span>
          </Link>

          <nav className="hidden md:flex items-center gap-1 text-sm font-medium">
            {links.map((link) => {
              const Icon = link.icon;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`flex items-center gap-2 rounded-md px-3 py-2 transition-colors hover:bg-accent hover:text-accent-foreground ${
                    location === link.href ? "bg-accent text-accent-foreground" : "text-muted-foreground"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center gap-4">
          {userData ? (
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
                    <p className="text-xs leading-none text-muted-foreground">
                      {userData.email}
                    </p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/profile" className="cursor-pointer w-full flex items-center">
                    <User className="mr-2 h-4 w-4" />
                    <span>Profile</span>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleSignOut} className="text-destructive focus:text-destructive cursor-pointer">
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Log out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}

          {/* Mobile Nav */}
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden">
                <Menu className="h-5 w-5" />
                <span className="sr-only">Toggle menu</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[300px] sm:w-[400px]">
              <div className="flex items-center gap-2 mb-8">
                <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
                  <Trophy className="h-5 w-5" />
                </div>
                <span className="font-bold tracking-tight text-foreground">
                  eFootball League
                </span>
              </div>
              <nav className="flex flex-col gap-2">
                {links.map((link) => {
                  const Icon = link.icon;
                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      className={`flex items-center gap-3 rounded-md px-3 py-2 text-base transition-colors hover:bg-accent hover:text-accent-foreground ${
                        location === link.href ? "bg-accent text-accent-foreground font-semibold" : "text-muted-foreground"
                      }`}
                    >
                      <Icon className="h-5 w-5" />
                      {link.label}
                    </Link>
                  );
                })}
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
