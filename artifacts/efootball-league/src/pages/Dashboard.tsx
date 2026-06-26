import { useState, useEffect } from "react";
import { Link } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/lib/firebase";
import { collection, query, where, getDocs, onSnapshot } from "firebase/firestore";
import { League, Team, Match, Payment, AppNotification } from "@/lib/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Trophy, Calendar, CheckCircle2, Shield, CreditCard, Bell, AlertCircle, TrendingUp } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";

export default function Dashboard() {
  const { user, userData } = useAuth();
  const [leagues, setLeagues] = useState<League[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [recentMatches, setRecentMatches] = useState<Match[]>([]);
  const [upcomingMatches, setUpcomingMatches] = useState<Match[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [stats, setStats] = useState({ wins: 0, draws: 0, losses: 0, goals: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    const fetchData = async () => {
      try {
        const [teamsSnap, leaguesSnap] = await Promise.all([
          getDocs(query(collection(db, "teams"), where("ownerUid", "==", user.uid))),
          getDocs(query(collection(db, "leagues"), where("memberUids", "array-contains", user.uid))),
        ]);

        const userTeams = teamsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Team));
        const userLeagues = leaguesSnap.docs.map(d => ({ id: d.id, ...d.data() } as League));
        setTeams(userTeams);
        setLeagues(userLeagues);

        if (userLeagues.length > 0) {
          const leagueIds = userLeagues.map(l => l.id);
          const [recentSnap, upcomingSnap] = await Promise.all([
            getDocs(query(collection(db, "matches"), where("leagueId", "in", leagueIds), where("status", "==", "approved"))),
            getDocs(query(collection(db, "matches"), where("leagueId", "in", leagueIds), where("status", "==", "scheduled"))),
          ]);

          const allRecent = recentSnap.docs.map(d => ({ id: d.id, ...d.data() } as Match));
          const teamIds = new Set(userTeams.map(t => t.id));

          // Compute career stats from approved matches
          let wins = 0, draws = 0, losses = 0, goals = 0;
          allRecent.forEach(m => {
            if (teamIds.has(m.homeTeamId)) {
              goals += m.homeScore ?? 0;
              if ((m.homeScore ?? 0) > (m.awayScore ?? 0)) wins++;
              else if (m.homeScore === m.awayScore) draws++;
              else losses++;
            } else if (teamIds.has(m.awayTeamId)) {
              goals += m.awayScore ?? 0;
              if ((m.awayScore ?? 0) > (m.homeScore ?? 0)) wins++;
              else if (m.awayScore === m.homeScore) draws++;
              else losses++;
            }
          });
          setStats({ wins, draws, losses, goals });

          setRecentMatches(allRecent.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 5));
          setUpcomingMatches(
            upcomingSnap.docs.map(d => ({ id: d.id, ...d.data() } as Match))
              .filter(m => teamIds.has(m.homeTeamId) || teamIds.has(m.awayTeamId))
              .sort((a, b) => a.scheduledDate - b.scheduledDate)
              .slice(0, 4)
          );
        }
      } catch (err) {
        console.error("Dashboard fetch error:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();

    // Realtime: payments + notifications
    const unsubPay = onSnapshot(
      query(collection(db, "payments"), where("uid", "==", user.uid)),
      snap => setPayments(snap.docs.map(d => ({ id: d.id, ...d.data() } as Payment)))
    );
    const unsubNotif = onSnapshot(
      query(collection(db, "notifications"), where("uid", "==", user.uid)),
      snap => setNotifications(
        snap.docs.map(d => ({ id: d.id, ...d.data() } as AppNotification))
          .sort((a, b) => b.createdAt - a.createdAt)
          .slice(0, 5)
      )
    );
    return () => { unsubPay(); unsubNotif(); };
  }, [user]);

  if (loading) {
    return (
      <div className="container mx-auto p-4 md:p-8 space-y-6">
        <Skeleton className="h-12 w-64" />
        <div className="grid gap-4 md:grid-cols-4">{[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-28" />)}</div>
        <div className="grid gap-6 md:grid-cols-2">{[1, 2].map(i => <Skeleton key={i} className="h-52" />)}</div>
      </div>
    );
  }

  const pendingPayments = payments.filter(p => p.status === "pending");
  const unreadNotifs = notifications.filter(n => !n.read);
  const totalMatches = stats.wins + stats.draws + stats.losses;
  const winPct = totalMatches > 0 ? Math.round((stats.wins / totalMatches) * 100) : 0;

  return (
    <div className="container mx-auto p-4 md:p-8 space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Welcome, {userData?.displayName || user?.displayName || "Manager"}
          </h1>
          <p className="text-muted-foreground mt-1">Your eFootball League overview.</p>
        </div>
        <Link href="/leagues">
          <Button className="gap-2"><Trophy className="h-4 w-4" />Browse Leagues</Button>
        </Link>
      </div>

      {/* Alert banners */}
      {pendingPayments.length > 0 && (
        <div className="flex items-center gap-3 rounded-lg border border-yellow-500/40 bg-yellow-500/10 p-3 text-sm text-yellow-300">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{pendingPayments.length} payment{pendingPayments.length > 1 ? "s" : ""} pending admin approval. You'll be notified once reviewed.</span>
        </div>
      )}

      {/* Stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="bg-card/50 border-border/50">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Leagues</CardTitle>
            <Trophy className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{leagues.length}</div></CardContent>
        </Card>
        <Card className="bg-card/50 border-border/50">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Teams</CardTitle>
            <Shield className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{teams.length}</div></CardContent>
        </Card>
        <Card className="bg-card/50 border-border/50">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Win Rate</CardTitle>
            <TrendingUp className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{winPct}%</div>
            <p className="text-xs text-muted-foreground mt-0.5">{stats.wins}W / {stats.draws}D / {stats.losses}L</p>
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-border/50">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Goals Scored</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{stats.goals}</div></CardContent>
        </Card>
      </div>

      {/* Main grid */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Recent Results */}
        <Card className="bg-card/50 border-border/50">
          <CardHeader>
            <CardTitle>Recent Results</CardTitle>
            <CardDescription>Latest approved matches in your leagues</CardDescription>
          </CardHeader>
          <CardContent>
            {recentMatches.length === 0 ? (
              <p className="text-sm text-muted-foreground">No results yet.</p>
            ) : (
              <div className="space-y-3">
                {recentMatches.map(match => (
                  <div key={match.id} className="flex items-center justify-between p-3 rounded-lg bg-accent/40 gap-2">
                    <div className="flex flex-col min-w-0">
                      <span className="text-sm font-medium truncate">{match.homeTeamName} vs {match.awayTeamName}</span>
                      <span className="text-xs text-muted-foreground truncate">
                        {leagues.find(l => l.id === match.leagueId)?.name ?? "League"}
                      </span>
                    </div>
                    <div className="font-mono font-bold shrink-0 px-2 py-0.5 bg-background rounded border border-border text-sm">
                      {match.homeScore} - {match.awayScore}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Upcoming Fixtures */}
        <Card className="bg-card/50 border-border/50">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>My Upcoming Fixtures</CardTitle>
              <Link href="/fixtures"><Button variant="ghost" size="sm" className="text-xs h-7">All fixtures</Button></Link>
            </div>
            <CardDescription>Your scheduled matches</CardDescription>
          </CardHeader>
          <CardContent>
            {upcomingMatches.length === 0 ? (
              <p className="text-sm text-muted-foreground">No upcoming fixtures.</p>
            ) : (
              <div className="space-y-3">
                {upcomingMatches.map(match => (
                  <div key={match.id} className="flex items-center justify-between p-3 rounded-lg border border-border/50 hover:bg-accent/30 transition-colors gap-2">
                    <div className="flex flex-col min-w-0">
                      <span className="text-sm font-medium truncate">{match.homeTeamName} vs {match.awayTeamName}</span>
                      <span className="text-xs text-muted-foreground truncate">
                        {leagues.find(l => l.id === match.leagueId)?.name ?? "League"}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground bg-accent/50 px-2 py-1 rounded shrink-0">
                      <Calendar className="h-3 w-3" />
                      {format(new Date(match.scheduledDate), "MMM d")}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Notifications */}
        <Card className="bg-card/50 border-border/50">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Bell className="h-4 w-4 text-primary" />Recent Notifications
                {unreadNotifs.length > 0 && <Badge className="text-xs py-0">{unreadNotifs.length} new</Badge>}
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {notifications.length === 0 ? (
              <p className="text-sm text-muted-foreground">No notifications yet.</p>
            ) : (
              <div className="space-y-2">
                {notifications.map(n => (
                  <div key={n.id} className={`p-3 rounded-lg text-sm ${!n.read ? "bg-primary/10 border border-primary/20" : "bg-accent/30"}`}>
                    <p className="font-medium leading-tight">{n.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{n.message}</p>
                    <p className="text-[10px] text-muted-foreground/60 mt-1">{format(new Date(n.createdAt), "MMM d, HH:mm")}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Payment Status */}
        <Card className="bg-card/50 border-border/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-primary" />Payment Status
            </CardTitle>
            <CardDescription>Your M-Pesa payment records</CardDescription>
          </CardHeader>
          <CardContent>
            {payments.length === 0 ? (
              <p className="text-sm text-muted-foreground">No payments submitted.</p>
            ) : (
              <div className="space-y-2">
                {payments.sort((a, b) => b.createdAt - a.createdAt).map(p => (
                  <div key={p.id} className="flex items-center justify-between p-3 rounded-lg border border-border/50 gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{p.leagueName ?? "League"}</p>
                      <p className="text-xs text-muted-foreground">TX: <span className="font-mono">{p.transactionCode}</span> · KES {p.amount}</p>
                      {p.adminNote && <p className="text-xs text-muted-foreground italic mt-0.5">"{p.adminNote}"</p>}
                    </div>
                    <Badge variant={p.status === "approved" ? "default" : p.status === "rejected" ? "destructive" : "outline"}
                      className={p.status === "pending" ? "border-yellow-500/60 text-yellow-400" : p.status === "resubmit" ? "border-orange-500/60 text-orange-400" : ""}>
                      {p.status}
                    </Badge>
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
