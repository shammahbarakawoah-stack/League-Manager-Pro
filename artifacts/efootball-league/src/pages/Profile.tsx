import { useState, useEffect } from "react";
import { Link } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/lib/firebase";
import {
  collection, query, where, getDocs, doc, updateDoc, getDoc, deleteDoc
} from "firebase/firestore";
import { Team, Match, League } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useToast } from "@/hooks/use-toast";
import { User, Shield, Activity, Save, Trophy, ArrowRight, LogOut, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle
} from "@/components/ui/dialog";

const profileSchema = z.object({
  displayName: z.string().min(2).max(50),
});

export default function Profile() {
  const { user, userData, signOut } = useAuth();
  const { toast } = useToast();
  const [teams, setTeams] = useState<Team[]>([]);
  const [leagueMap, setLeagueMap] = useState<Record<string, League>>({});
  const [matchCountMap, setMatchCountMap] = useState<Record<string, number>>({});
  const [stats, setStats] = useState({ matches: 0, wins: 0, draws: 0, losses: 0, goals: 0 });
  const [loading, setLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const [teamToDelete, setTeamToDelete] = useState<Team | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const displayName = userData?.displayName || user?.displayName || "";

  const form = useForm<z.infer<typeof profileSchema>>({
    resolver: zodResolver(profileSchema),
    defaultValues: { displayName },
  });

  useEffect(() => {
    if (displayName) form.reset({ displayName });
  }, [displayName]);

  useEffect(() => {
    if (!user) return;
    const fetchData = async () => {
      try {
        const teamsSnap = await getDocs(
          query(collection(db, "teams"), where("ownerUid", "==", user.uid))
        );
        const fetchedTeams = teamsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Team));
        setTeams(fetchedTeams);

        if (fetchedTeams.length > 0) {
          // League info
          const leagueIds = [...new Set(fetchedTeams.map(t => t.leagueId).filter(Boolean))];
          const leagueDocs = await Promise.all(leagueIds.map(id => getDoc(doc(db, "leagues", id))));
          const map: Record<string, League> = {};
          leagueDocs.forEach(snap => {
            if (snap.exists()) map[snap.id] = { id: snap.id, ...snap.data() } as League;
          });
          setLeagueMap(map);

          // Match counts per team + career stats
          const matchPairs = await Promise.all(
            fetchedTeams.map(team =>
              Promise.all([
                getDocs(query(collection(db, "matches"), where("homeTeamId", "==", team.id), where("status", "==", "approved"))),
                getDocs(query(collection(db, "matches"), where("awayTeamId", "==", team.id), where("status", "==", "approved"))),
              ])
            )
          );

          const countMap: Record<string, number> = {};
          let totalMatches = 0, totalWins = 0, totalDraws = 0, totalLosses = 0, totalGoals = 0;

          fetchedTeams.forEach((team, idx) => {
            const [homeSnap, awaySnap] = matchPairs[idx];
            const count = homeSnap.size + awaySnap.size;
            countMap[team.id] = count;

            homeSnap.docs.forEach(d => {
              const m = d.data() as Match;
              totalMatches++; totalGoals += (m.homeScore || 0);
              if ((m.homeScore ?? 0) > (m.awayScore ?? 0)) totalWins++;
              else if (m.homeScore === m.awayScore) totalDraws++;
              else totalLosses++;
            });
            awaySnap.docs.forEach(d => {
              const m = d.data() as Match;
              totalMatches++; totalGoals += (m.awayScore || 0);
              if ((m.awayScore ?? 0) > (m.homeScore ?? 0)) totalWins++;
              else if (m.awayScore === m.homeScore) totalDraws++;
              else totalLosses++;
            });
          });

          setMatchCountMap(countMap);
          setStats({ matches: totalMatches, wins: totalWins, draws: totalDraws, losses: totalLosses, goals: totalGoals });
        }
        setLoading(false);
      } catch (error) {
        console.error("Error fetching profile data:", error);
        setLoading(false);
      }
    };
    fetchData();
  }, [user]);

  const onSubmit = async (values: z.infer<typeof profileSchema>) => {
    if (!user) return;
    try {
      setIsUpdating(true);
      await updateDoc(doc(db, "users", user.uid), { displayName: values.displayName });
      toast({ title: "Profile updated successfully" });
    } catch (error: any) {
      toast({ title: "Error updating profile", description: error.message, variant: "destructive" });
    } finally {
      setIsUpdating(false);
    }
  };

  const confirmDeleteTeam = async () => {
    if (!teamToDelete) return;
    setDeleteLoading(true);
    try {
      await deleteDoc(doc(db, "teams", teamToDelete.id));
      setTeams(prev => prev.filter(t => t.id !== teamToDelete.id));
      toast({ title: `"${teamToDelete.name ?? "Team"}" deleted` });
      setTeamToDelete(null);
    } catch (error: any) {
      toast({ title: "Failed to delete team", description: error.message, variant: "destructive" });
    } finally {
      setDeleteLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto p-4 md:p-8 space-y-6">
        <Skeleton className="h-24 w-full max-w-2xl" />
        <div className="grid gap-6 md:grid-cols-2"><Skeleton className="h-48" /><Skeleton className="h-48" /></div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const initials = ((displayName ?? "").substring(0, 2).toUpperCase()) || "??";

  return (
    <div className="container mx-auto p-4 md:p-8 max-w-4xl space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between gap-4 mb-2">
        <div className="flex items-center gap-4">
          <Avatar className="h-16 w-16 border-4 border-border shadow-lg">
            <AvatarFallback className="text-2xl font-bold bg-primary/20 text-primary">{initials}</AvatarFallback>
          </Avatar>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{displayName || "Manager"}</h1>
            <p className="text-sm text-muted-foreground">{userData?.email || user?.email}</p>
          </div>
        </div>
        <Button variant="outline" onClick={() => signOut()} className="gap-2 text-destructive border-destructive/40 hover:bg-destructive/10 shrink-0">
          <LogOut className="h-4 w-4" />
          <span className="hidden sm:inline">Log out</span>
        </Button>
      </div>

      {/* Stats */}
      <Card className="bg-card/50 border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Activity className="h-4 w-4 text-primary" />Career Stats
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-5 gap-2 text-center">
            {[
              { label: "Matches", value: stats.matches },
              { label: "Wins", value: stats.wins, highlight: true },
              { label: "Draws", value: stats.draws },
              { label: "Losses", value: stats.losses },
              { label: "Goals", value: stats.goals },
            ].map(({ label, value, highlight }) => (
              <div key={label} className="space-y-1">
                <div className={`text-2xl font-bold ${highlight ? "text-primary" : "text-foreground"}`}>{value}</div>
                <div className="text-xs text-muted-foreground uppercase tracking-wider">{label}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Team Management */}
      <Card className="bg-card/50 border-border/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />Team Management
          </CardTitle>
          <CardDescription>All teams you are currently managing</CardDescription>
        </CardHeader>
        <CardContent>
          {teams.length === 0 ? (
            <div className="text-center py-6 space-y-2">
              <Shield className="h-10 w-10 mx-auto text-muted-foreground opacity-40" />
              <p className="text-muted-foreground text-sm">You have no teams yet.</p>
              <Link href="/leagues">
                <Button variant="outline" size="sm" className="mt-2 gap-2">
                  <Trophy className="h-4 w-4" />Browse Leagues
                </Button>
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {teams.map(team => {
                const league = leagueMap[team.leagueId];
                const matchCount = matchCountMap[team.id] ?? 0;
                const isUnused = matchCount === 0;
                return (
                  <div key={team.id} className="flex items-center gap-4 p-4 rounded-lg border border-border/50 bg-background/50 hover:bg-accent/20 transition-colors">
                    <Avatar className="h-12 w-12 rounded-xl border-2 border-border flex-shrink-0">
                      <AvatarFallback className="rounded-xl font-bold text-sm bg-primary/10 text-primary">
                        {((team.name ?? "??").substring(0, 2)).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold truncate">{team.name ?? "Unnamed Team"}</p>
                        {isUnused && (
                          <Badge variant="outline" className="text-xs border-muted-foreground/40 text-muted-foreground">
                            No matches
                          </Badge>
                        )}
                      </div>
                      {league ? (
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          <Trophy className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                          <span className="text-sm text-muted-foreground truncate">{league.name ?? "Unknown League"}</span>
                          <Badge variant={league.status === "active" ? "default" : "secondary"} className="text-xs py-0">
                            {league.status}
                          </Badge>
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground mt-0.5">League unavailable</p>
                      )}
                      {(team.squad?.length ?? 0) > 0 && (
                        <p className="text-xs text-muted-foreground mt-0.5">{team.squad!.length} players in squad</p>
                      )}
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {/* Delete — always visible, required for unused teams */}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        onClick={() => setTeamToDelete(team)}
                        title="Delete team"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>

                      {league && (
                        <Link href={`/leagues/${team.leagueId}`}>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <ArrowRight className="h-4 w-4" />
                          </Button>
                        </Link>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Profile Settings */}
      <Card className="bg-card/50 border-border/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <User className="h-4 w-4 text-primary" />Profile Settings
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 max-w-sm">
              <FormField
                control={form.control}
                name="displayName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Display Name</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" disabled={isUpdating} className="gap-2">
                <Save className="h-4 w-4" />
                {isUpdating ? "Saving..." : "Save Changes"}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>

      {/* Delete confirmation dialog */}
      <Dialog open={!!teamToDelete} onOpenChange={open => !open && setTeamToDelete(null)}>
        <DialogContent className="sm:max-w-[380px]">
          <DialogHeader>
            <DialogTitle>Delete Team</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete <strong>{teamToDelete?.name ?? "this team"}</strong>?
              {(matchCountMap[teamToDelete?.id ?? ""] ?? 0) > 0
                ? " Match history will be kept but the team will be removed."
                : " This team has no matches and will be permanently removed."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 pt-2">
            <Button variant="outline" onClick={() => setTeamToDelete(null)}>Cancel</Button>
            <Button variant="destructive" onClick={confirmDeleteTeam} disabled={deleteLoading}>
              {deleteLoading ? "Deleting..." : "Delete Team"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
