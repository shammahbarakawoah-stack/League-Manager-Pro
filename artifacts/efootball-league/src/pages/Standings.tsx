import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/lib/firebase";
import { collection, query, where, getDocs } from "firebase/firestore";
import { League, Team, Match } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StandingsTable } from "@/components/StandingsTable";
import { Trophy } from "lucide-react";

export default function Standings() {
  const { user } = useAuth();
  const [leagues, setLeagues] = useState<League[]>([]);
  const [leagueData, setLeagueData] = useState<Record<string, { teams: Team[], matches: Match[] }>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    const fetchData = async () => {
      try {
        const leaguesSnap = await getDocs(
          query(collection(db, "leagues"), where("memberUids", "array-contains", user.uid))
        );
        const fetchedLeagues = leaguesSnap.docs.map(d => ({ id: d.id, ...d.data() } as League));
        setLeagues(fetchedLeagues);

        const results = await Promise.all(
          fetchedLeagues.map(league =>
            Promise.all([
              getDocs(query(collection(db, "teams"), where("leagueId", "==", league.id))),
              getDocs(query(collection(db, "matches"), where("leagueId", "==", league.id), where("status", "==", "approved"))),
            ]).then(([teamsSnap, matchesSnap]) => ({
              leagueId: league.id,
              teams: teamsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Team)),
              matches: matchesSnap.docs.map(d => ({ id: d.id, ...d.data() } as Match)),
            }))
          )
        );

        const dataMap: Record<string, { teams: Team[], matches: Match[] }> = {};
        for (const r of results) dataMap[r.leagueId] = { teams: r.teams, matches: r.matches };

        setLeagueData(dataMap);
        setLoading(false);
      } catch (error) {
        console.error("Error fetching standings:", error);
        setLoading(false);
      }
    };

    fetchData();
  }, [user]);

  if (loading) {
    return (
      <div className="container mx-auto p-4 md:p-8 space-y-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-[400px] w-full mt-8" />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 md:p-8 space-y-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Standings</h1>
        <p className="text-muted-foreground mt-1">Current tables for all your active leagues.</p>
      </div>

      {leagues.length === 0 ? (
        <Card className="border-dashed bg-muted/20">
          <CardContent className="flex flex-col items-center justify-center p-12 text-center">
            <Trophy className="h-12 w-12 text-muted-foreground mb-4 opacity-50" />
            <h3 className="text-lg font-semibold">No Leagues</h3>
            <p className="text-sm text-muted-foreground mt-2">
              You are not a member of any leagues yet.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-12">
          {leagues.map(league => {
            const data = leagueData[league.id];
            if (!data) return null;

            return (
              <div key={league.id} className="space-y-4">
                <div className="flex items-center gap-2">
                  <Trophy className="h-5 w-5 text-primary" />
                  <h2 className="text-2xl font-bold">{league.name}</h2>
                </div>
                <StandingsTable teams={data.teams} matches={data.matches} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
