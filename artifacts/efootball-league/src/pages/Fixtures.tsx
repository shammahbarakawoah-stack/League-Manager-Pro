import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/lib/firebase";
import { collection, query, where, onSnapshot, getDocs, doc, updateDoc } from "firebase/firestore";
import { League, Match, Team } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { Calendar } from "lucide-react";

const resultSchema = z.object({
  homeScore: z.coerce.number().min(0),
  awayScore: z.coerce.number().min(0),
});

export default function Fixtures() {
  const { userData } = useAuth();
  const { toast } = useToast();
  const [leagues, setLeagues] = useState<League[]>([]);
  const [userTeams, setUserTeams] = useState<Team[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);

  const form = useForm<z.infer<typeof resultSchema>>({
    resolver: zodResolver(resultSchema),
    defaultValues: { homeScore: 0, awayScore: 0 },
  });

  useEffect(() => {
    if (!userData) return;

    const fetchData = async () => {
      try {
        // Fetch leagues and teams in parallel — no dependency on each other
        const [leaguesSnap, teamsSnap] = await Promise.all([
          getDocs(query(collection(db, "leagues"), where("memberUids", "array-contains", userData.uid))),
          getDocs(query(collection(db, "teams"), where("ownerUid", "==", userData.uid))),
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
            const fetchedMatches = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Match));
            fetchedMatches.sort((a,b) => a.scheduledDate - b.scheduledDate);
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
  }, [userData]);

  const onSubmitResult = async (values: z.infer<typeof resultSchema>) => {
    if (!selectedMatch || !userData) return;

    try {
      const matchRef = doc(db, "matches", selectedMatch.id);
      await updateDoc(matchRef, {
        homeScore: values.homeScore,
        awayScore: values.awayScore,
        status: "pending_approval",
        submittedByUid: userData.uid,
        updatedAt: Date.now()
      });
      
      setSelectedMatch(null);
      form.reset();
      toast({ title: "Result submitted", description: "Waiting for admin approval." });
    } catch (error: any) {
      toast({ title: "Error submitting result", description: error.message, variant: "destructive" });
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto p-4 md:p-8 space-y-6">
        <Skeleton className="h-10 w-48" />
        <div className="grid gap-4 md:grid-cols-2">
          {[1,2,3,4].map(i => <Skeleton key={i} className="h-32" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 md:p-8 space-y-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Upcoming Fixtures</h1>
        <p className="text-muted-foreground mt-1">Scheduled matches across all your leagues.</p>
      </div>

      {matches.length === 0 ? (
        <Card className="border-dashed bg-muted/20">
          <CardContent className="flex flex-col items-center justify-center p-12 text-center">
            <Calendar className="h-12 w-12 text-muted-foreground mb-4 opacity-50" />
            <h3 className="text-lg font-semibold">No Fixtures</h3>
            <p className="text-sm text-muted-foreground mt-2">
              There are no scheduled matches in your leagues at the moment.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {matches.map(match => {
            const league = leagues.find(l => l.id === match.leagueId);
            const isUserMatch = userTeams.some(t => t.id === match.homeTeamId || t.id === match.awayTeamId);

            return (
              <Card key={match.id} className="bg-card/50 hover:bg-card/80 transition-colors">
                <CardHeader className="pb-3 pt-4 px-4 border-b border-border/50">
                  <div className="flex justify-between items-center text-xs text-muted-foreground font-medium">
                    <span className="truncate pr-2 text-primary">{league?.name}</span>
                    <span className="flex items-center gap-1 whitespace-nowrap">
                      <Calendar className="h-3 w-3" />
                      {format(new Date(match.scheduledDate), "MMM d, HH:mm")}
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between py-2">
                    <div className="flex-1 font-semibold text-right">{match.homeTeamName}</div>
                    <div className="px-4 text-xs font-mono text-muted-foreground">VS</div>
                    <div className="flex-1 font-semibold">{match.awayTeamName}</div>
                  </div>
                  
                  {isUserMatch && (
                    <Button 
                      className="w-full mt-4" 
                      onClick={() => { setSelectedMatch(match); form.reset(); }}
                    >
                      Submit Result
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={!!selectedMatch} onOpenChange={(open) => !open && setSelectedMatch(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Submit Match Result</DialogTitle>
            <DialogDescription>
              Enter the final score for {selectedMatch?.homeTeamName} vs {selectedMatch?.awayTeamName}
            </DialogDescription>
          </DialogHeader>
          {selectedMatch && (
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmitResult)} className="space-y-6 pt-4">
                <div className="flex items-center gap-4">
                  <FormField
                    control={form.control}
                    name="homeScore"
                    render={({ field }) => (
                      <FormItem className="flex-1 text-center">
                        <FormLabel className="text-sm font-semibold truncate block">
                          {selectedMatch.homeTeamName} (Home)
                        </FormLabel>
                        <FormControl>
                          <Input type="number" min="0" className="text-center text-2xl font-mono h-14" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="font-bold text-xl pt-6">-</div>
                  <FormField
                    control={form.control}
                    name="awayScore"
                    render={({ field }) => (
                      <FormItem className="flex-1 text-center">
                        <FormLabel className="text-sm font-semibold truncate block">
                          {selectedMatch.awayTeamName} (Away)
                        </FormLabel>
                        <FormControl>
                          <Input type="number" min="0" className="text-center text-2xl font-mono h-14" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setSelectedMatch(null)}>Cancel</Button>
                  <Button type="submit">Submit for Approval</Button>
                </DialogFooter>
              </form>
            </Form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
