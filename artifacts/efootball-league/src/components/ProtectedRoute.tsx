import { useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { Spinner } from "@/components/ui/spinner";

export function ProtectedRoute({ children, adminOnly = false }: { children: React.ReactNode, adminOnly?: boolean }) {
  const { user, loading, isAdmin } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!loading) {
      if (!user) {
        setLocation("/login");
      } else if (adminOnly && !isAdmin) {
        setLocation("/");
      }
    }
  }, [user, loading, isAdmin, adminOnly, setLocation]);

  if (loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <Spinner className="size-10" />
      </div>
    );
  }

  if (!user || (adminOnly && !isAdmin)) {
    return null;
  }

  return <>{children}</>;
}
