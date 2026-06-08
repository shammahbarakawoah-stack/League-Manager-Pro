import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/lib/firebase";
import { collection, query, where, onSnapshot, getDocs, doc, updateDoc } from "firebase/firestore";
import { League, Match, Team } from "@/lib/types";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { Calendar, Badge as BadgeIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function Fixtures() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [leagues, setLeagues] = useState<League[]>([]);
  const [userTeams, setUserTeams] = useState<Team[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);

  // Result form state
  const [homeScore, setHomeScore] = useState("0");
  const [awayScore, setAwayScore] = useState("0");
  const [scorers, setScorers] = useState("");
  const [assists, setAssists] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!user) return;

    const fetchData = async () => {
      try {
        const [leaguesSnap, teamsSnap] = await Promise.all([
          getDocs(query(collection(db, "leagues"), where("memberUids", "array-contains", user.uid))),
          getDocs(query(collection(db, "teams"), where("ownerUid", "==", user.uid))),
        ]);

        const fetchedLeagues = leaguesSnap.docs.map(d => ({ id: d.id, ...d.data() } as League));
        const fetchedTeams = teamsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Team));
        setLeagues(fetchedLeagues);
        setUserTeams(fetchedTeams);

        if (fetchedLeagues.length > 0) {
          const leagueIds = fetchedLeagues.map(l => l.id);
          const matchesQ = query(
            collection(db, "matches"),
            where("leagueId", "in", leagueIds),
            where("status", "==", "scheduled")
          );

          const unsubscribe = onSnapshot(matchesQ, (snapshot) => {
            const fetchedMatches = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Match));
            fetchedMatches.sort((a, b) => a.scheduledDate - b.scheduledDate);
            setMatches(fetchedMatches);
            setLoading(false);
          });

          return unsubscribe;
        } else {
          setLoading(false);
        }
      } catch (error) {
        console.error("Error fetching fixtures:", error);
        setLoading(false);
      }
    };

    const unsub = fetchData();
    return () => { unsub && unsub.then(f => f && f()); };
  }, [user]);

  const openSubmit = (match: Match) => {
    setSelectedMatch(match);
    setHomeScore("0");
    setAwayScore("0");
    setScorers("");
    setAssists("");
  };

  const onSubmitResult = async () => {
    if (!selectedMatch || !user) return;
    const hs = parseInt(homeScore, 10);
    const as_ = parseInt(awayScore, 10);
    if (isNaN(hs) || isNaN(as_) || hs < 0 || as_ < 0) {
      toast({ title: "Enter valid scores", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const scorerList = scorers.split(",").map(s => s.trim()).filter(Boolean);
      const assistList = assists.split(",").map(s => s.trim()).filter(Boolean);

      await updateDoc(doc(db, "matches", selectedMatch.id), {
        homeScore: hs,
        awayScore: as_,
        scorers: scorerList,
        assists: assistList,
        status: "pending_approval",
        submittedByUid: user.uid,
        updatedAt: Date.now()
      });

      setSelectedMatch(null);
      toast({ title: "Result submitted", description: "Waiting for admin approval." });
    } catch (error: any) {
      toast({ title: "Error submitting result", description: error.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto p-4 md:p-8 space-y-6">
        <Skeleton className="h-10 w-48" />
        <div className="grid gap-4 md:grid-cols-2">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-32" />)}
        </div>
      </div>
    );
  }

  // Group by matchday
  const byMatchday: Record<string, Match[]> = {};
  matches.forEach(m => {
    const key = m.matchday != null ? String(m.matchday) : "0";
    if (!byMatchday[key]) byMatchday[key] = [];
    byMatchday[key].push(m);
  });

  return (
    <div className="container mx-auto p-4 md:p-8 space-y-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">Upcoming Fixtures</h1>
        <p className="text-muted-foreground mt-1">Scheduled matches across all your leagues.</p>
      </div>

      {matches.length === 0 ? (
        <Card className="border-dashed bg-muted/20">
          <CardContent className="flex flex-col items-center justify-center p-12 text-center">
            <Calendar className="h-12 w-12 text-muted-foreground mb-4 opacity-50" />
            <h3 className="text-lg font-semibold">No Fixtures</h3>
            <p className="text-sm text-muted-foreground mt-2">No scheduled matches in your leagues yet.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-8">
          {Object.entries(byMatchday)
            .sort(([a], [b]) => Number(a) - Number(b))
            .map(([matchday, dayMatches]) => {
              const league = leagues.find(l => l.id === dayMatches[0].leagueId);
              return (
                <div key={matchday} className="space-y-3">
                  <div className="flex items-center gap-3 flex-wrap">
                    {Number(matchday) > 0 && (
                      <Badge variant="outline" className="font-mono">
                        Matchday {matchday}{dayMatches[0].leg ? ` · Leg ${dayMatches[0].leg}` : ""}
                      </Badge>
                    )}
                    <span className="text-sm text-muted-foreground flex items-center gap-1">
                      <Calendar className="h-3.5 w-3.5" />
                      {format(new Date(dayMatches[0].scheduledDate), "EEEE d MMMM yyyy")}
                    </span>
                    {league && <span className="text-xs text-primary font-medium">{league.name}</span>}
                  </div>
                  <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                    {dayMatches.map(match => {
                      const isUserMatch = userTeams.some(t => t.id === match.homeTeamId || t.id === match.awayTeamId);
                      return (
                        <Card key={match.id} className="bg-card/50 hover:bg-card/80 transition-colors">
                          <CardContent className="p-4">
                            <div className="flex items-center justify-between gap-2 py-1">
                              <div className="flex-1 font-semibold text-right text-sm truncate">{match.homeTeamName}</div>
                              <div className="text-xs font-mono text-muted-foreground px-2 shrink-0">VS</div>
                              <div className="flex-1 font-semibold text-sm truncate">{match.awayTeamName}</div>
                            </div>
                            {isUserMatch && (
                              <Button className="w-full mt-3 h-8 text-xs" onClick={() => openSubmit(match)}>
                                Submit Result
                              </Button>
                            )}
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                </div>
              );
            })}
        </div>
      )}

      {/* Result submission dialog */}
      <Dialog open={!!selectedMatch} onOpenChange={open => !open && setSelectedMatch(null)}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Submit Match Result</DialogTitle>
            <DialogDescription>
              {selectedMatch?.homeTeamName} vs {selectedMatch?.awayTeamName}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 pt-2">
            {/* Scores */}
            <div className="flex items-end gap-3">
              <div className="flex-1 space-y-1 text-center">
                <Label className="text-xs truncate block">{selectedMatch?.homeTeamName}</Label>
                <Input
                  type="number" min="0" value={homeScore}
                  onChange={e => setHomeScore(e.target.value)}
                  className="text-center text-2xl font-mono h-14"
                />
              </div>
              <div className="pb-3 font-bold text-xl text-muted-foreground shrink-0">-</div>
              <div className="flex-1 space-y-1 text-center">
                <Label className="text-xs truncate block">{selectedMatch?.awayTeamName}</Label>
                <Input
                  type="number" min="0" value={awayScore}
                  onChange={e => setAwayScore(e.target.value)}
                  className="text-center text-2xl font-mono h-14"
                />
              </div>
            </div>

            {/* Scorers */}
            <div className="space-y-1.5">
              <Label htmlFor="scorers" className="text-sm">Goal Scorers <span className="text-muted-foreground font-normal">(optional, comma-separated)</span></Label>
              <Input
                id="scorers"
                placeholder="e.g. Ronaldo, Messi, Neymar"
                value={scorers}
                onChange={e => setScorers(e.target.value)}
              />
            </div>

            {/* Assists */}
            <div className="space-y-1.5">
              <Label htmlFor="assists" className="text-sm">Assists <span className="text-muted-foreground font-normal">(optional, comma-separated)</span></Label>
              <Input
                id="assists"
                placeholder="e.g. Modric, De Bruyne"
                value={assists}
                onChange={e => setAssists(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter className="gap-2 pt-2">
            <Button variant="outline" onClick={() => setSelectedMatch(null)}>Cancel</Button>
            <Button onClick={onSubmitResult} disabled={submitting}>
              {submitting ? "Submitting…" : "Submit for Approval"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
