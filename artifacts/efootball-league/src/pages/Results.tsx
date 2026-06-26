import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/lib/firebase";
import { collection, query, where, onSnapshot, getDocs } from "firebase/firestore";
import { League, Match } from "@/lib/types";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { CheckCircle2, Calendar } from "lucide-react";

export default function Results() {
  const { user } = useAuth();
  const [leagues, setLeagues] = useState<League[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    let unsubMatches: (() => void) | undefined;
    const fetchData = async () => {
      try {
        const leaguesSnap = await getDocs(
          query(collection(db, "leagues"), where("memberUids", "array-contains", user.uid))
        );
        const fetchedLeagues = leaguesSnap.docs.map(d => ({ id: d.id, ...d.data() } as League));
        setLeagues(fetchedLeagues);

        if (fetchedLeagues.length > 0) {
          const leagueIds = fetchedLeagues.map(l => l.id);
          const matchesQ = query(
            collection(db, "matches"),
            where("leagueId", "in", leagueIds),
            where("status", "==", "approved")
          );
          unsubMatches = onSnapshot(matchesQ, (snapshot) => {
            const fetchedMatches = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Match));
            fetchedMatches.sort((a, b) => b.updatedAt - a.updatedAt);
            setMatches(fetchedMatches);
            setLoading(false);
          });
        } else {
          setLoading(false);
        }
      } catch (error) {
        console.error("Error fetching results:", error);
        setLoading(false);
      }
    };
    fetchData();
    return () => { unsubMatches?.(); };
  }, [user]);

  if (loading) {
    return (
      <div className="container mx-auto p-4 md:p-8 space-y-6">
        <Skeleton className="h-10 w-48" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map(i => <Skeleton key={i} className="h-32" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 md:p-8 space-y-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Match Results</h1>
        <p className="text-muted-foreground mt-1">Official results from across your leagues.</p>
      </div>

      {matches.length === 0 ? (
        <Card className="border-dashed bg-muted/20">
          <CardContent className="flex flex-col items-center justify-center p-12 text-center">
            <CheckCircle2 className="h-12 w-12 text-muted-foreground mb-4 opacity-50" />
            <h3 className="text-lg font-semibold">No Results</h3>
            <p className="text-sm text-muted-foreground mt-2">
              There are no approved match results in your leagues yet.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {matches.map(match => {
            const league = leagues.find(l => l.id === match.leagueId);

            return (
              <Card key={match.id} className="bg-card/50 overflow-hidden border-l-4 border-l-primary">
                <CardHeader className="pb-3 pt-4 px-4 bg-muted/30 border-b border-border/50">
                  <div className="flex justify-between items-center text-xs text-muted-foreground font-medium">
                    <span className="truncate pr-2 text-primary">{league?.name}</span>
                    <span className="flex items-center gap-1 whitespace-nowrap">
                      <Calendar className="h-3 w-3" />
                      {format(new Date(match.updatedAt), "MMM d, yyyy")}
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between py-2">
                    <div className={`flex-1 font-semibold text-right ${match.homeScore! > match.awayScore! ? 'text-foreground' : 'text-muted-foreground'}`}>
                      {match.homeTeamName}
                    </div>
                    <div className="px-5 py-2 text-xl font-bold font-mono bg-background border border-border rounded shadow-sm mx-4">
                      {match.homeScore} - {match.awayScore}
                    </div>
                    <div className={`flex-1 font-semibold ${match.awayScore! > match.homeScore! ? 'text-foreground' : 'text-muted-foreground'}`}>
                      {match.awayTeamName}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
