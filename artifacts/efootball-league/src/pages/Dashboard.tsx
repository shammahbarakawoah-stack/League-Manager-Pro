import { useState, useEffect } from "react";
import { Link } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/lib/firebase";
import { collection, query, where, getDocs, orderBy, limit } from "firebase/firestore";
import { League, Team, Match } from "@/lib/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Trophy, Calendar, CheckCircle2, Shield } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";

export default function Dashboard() {
  const { userData } = useAuth();
  const [leagues, setLeagues] = useState<League[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [recentMatches, setRecentMatches] = useState<Match[]>([]);
  const [upcomingMatches, setUpcomingMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userData) return;

    const fetchDashboardData = async () => {
      try {
        // Fetch teams and leagues in parallel — no dependency on each other
        const [teamsSnapshot, leaguesSnapshot] = await Promise.all([
          getDocs(query(collection(db, "teams"), where("ownerUid", "==", userData.uid))),
          getDocs(query(collection(db, "leagues"), where("memberUids", "array-contains", userData.uid))),
        ]);

        const userTeams = teamsSnapshot.docs.map(d => ({ id: d.id, ...d.data() } as Team));
        const userLeagues = leaguesSnapshot.docs.map(d => ({ id: d.id, ...d.data() } as League));
        setTeams(userTeams);
        setLeagues(userLeagues);

        if (userLeagues.length > 0) {
          const leagueIds = userLeagues.map(l => l.id);

          // Fetch recent and upcoming matches in parallel
          const [recentSnapshot, upcomingSnapshot] = await Promise.all([
            getDocs(query(
              collection(db, "matches"),
              where("leagueId", "in", leagueIds),
              where("status", "==", "approved"),
            )),
            getDocs(query(
              collection(db, "matches"),
              where("leagueId", "in", leagueIds),
              where("status", "==", "scheduled"),
            )),
          ]);

          const allRecent = recentSnapshot.docs
            .map(d => ({ id: d.id, ...d.data() } as Match))
            .sort((a, b) => b.updatedAt - a.updatedAt)
            .slice(0, 5);

          const allUpcoming = upcomingSnapshot.docs
            .map(d => ({ id: d.id, ...d.data() } as Match))
            .sort((a, b) => a.scheduledDate - b.scheduledDate)
            .slice(0, 3);

          setRecentMatches(allRecent);
          setUpcomingMatches(allUpcoming);
        }
      } catch (error) {
        console.error("Error fetching dashboard data", error);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, [userData]);

  if (loading) {
    return (
      <div className="container mx-auto p-4 md:p-8 space-y-6">
        <Skeleton className="h-12 w-64" />
        <div className="grid gap-6 md:grid-cols-3">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 md:p-8 space-y-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Welcome, {userData?.displayName}</h1>
          <p className="text-muted-foreground mt-1">Here's what's happening across your leagues.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/leagues">
            <Button>Join League</Button>
          </Link>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card className="bg-card/50 border-border/50">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Active Leagues</CardTitle>
            <Trophy className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{leagues.length}</div>
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-border/50">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Teams Managed</CardTitle>
            <Shield className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{teams.length}</div>
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-border/50">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Recent Results</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{recentMatches.length}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="bg-card/50 border-border/50">
          <CardHeader>
            <CardTitle>Recent Results</CardTitle>
            <CardDescription>Latest approved matches in your leagues</CardDescription>
          </CardHeader>
          <CardContent>
            {recentMatches.length === 0 ? (
              <p className="text-sm text-muted-foreground">No recent results found.</p>
            ) : (
              <div className="space-y-4">
                {recentMatches.map(match => (
                  <div key={match.id} className="flex items-center justify-between p-3 rounded-lg bg-accent/50">
                    <div className="flex flex-col">
                      <span className="text-sm font-medium">{match.homeTeamName} vs {match.awayTeamName}</span>
                      <span className="text-xs text-muted-foreground">
                        {leagues.find(l => l.id === match.leagueId)?.name || 'Unknown League'}
                      </span>
                    </div>
                    <div className="font-mono font-bold text-lg px-3 py-1 bg-background rounded border border-border">
                      {match.homeScore} - {match.awayScore}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-card/50 border-border/50">
          <CardHeader>
            <CardTitle>Upcoming Fixtures</CardTitle>
            <CardDescription>Your next scheduled matches</CardDescription>
          </CardHeader>
          <CardContent>
            {upcomingMatches.length === 0 ? (
              <p className="text-sm text-muted-foreground">No upcoming fixtures scheduled.</p>
            ) : (
              <div className="space-y-4">
                {upcomingMatches.map(match => (
                  <div key={match.id} className="flex items-center justify-between p-3 rounded-lg border border-border/50 hover:bg-accent/30 transition-colors">
                    <div className="flex flex-col">
                      <span className="text-sm font-medium">{match.homeTeamName} vs {match.awayTeamName}</span>
                      <span className="text-xs text-muted-foreground">
                        {leagues.find(l => l.id === match.leagueId)?.name || 'Unknown League'}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground bg-accent/50 px-2 py-1 rounded">
                      <Calendar className="h-3 w-3" />
                      {format(new Date(match.scheduledDate), "MMM d")}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
