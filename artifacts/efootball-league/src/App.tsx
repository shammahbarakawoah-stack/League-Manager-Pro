import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import { AuthProvider } from "@/contexts/AuthContext";
import { NavBar } from "@/components/NavBar";
import { ProtectedRoute } from "@/components/ProtectedRoute";

import Dashboard from "@/pages/Dashboard";
import Login from "@/pages/Login";
import Register from "@/pages/Register";
import Leagues from "@/pages/Leagues";
import LeagueDetail from "@/pages/LeagueDetail";
import Fixtures from "@/pages/Fixtures";
import Results from "@/pages/Results";
import Standings from "@/pages/Standings";
import Profile from "@/pages/Profile";
import Admin from "@/pages/Admin";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient();

function Router() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <NavBar />
      <main className="flex-1">
        <Switch>
          <Route path="/login" component={Login} />
          <Route path="/register" component={Register} />
          
          <Route path="/">
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          </Route>
          
          <Route path="/leagues">
            <ProtectedRoute>
              <Leagues />
            </ProtectedRoute>
          </Route>
          
          <Route path="/leagues/:id">
            <ProtectedRoute>
              <LeagueDetail />
            </ProtectedRoute>
          </Route>

          <Route path="/fixtures">
            <ProtectedRoute>
              <Fixtures />
            </ProtectedRoute>
          </Route>

          <Route path="/results">
            <ProtectedRoute>
              <Results />
            </ProtectedRoute>
          </Route>

          <Route path="/standings">
            <ProtectedRoute>
              <Standings />
            </ProtectedRoute>
          </Route>

          <Route path="/profile">
            <ProtectedRoute>
              <Profile />
            </ProtectedRoute>
          </Route>

          <Route path="/admin">
            <ProtectedRoute adminOnly>
              <Admin />
            </ProtectedRoute>
          </Route>
          
          <Route component={NotFound} />
        </Switch>
      </main>
    </div>
  );
}

function App() {
  return (
    <ThemeProvider defaultTheme="dark" attribute="class">
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <TooltipProvider>
            <WouterRouter base={import.meta.env.BASE_URL?.replace(/\/$/, "")}>
              <Router />
            </WouterRouter>
            <Toaster />
          </TooltipProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
