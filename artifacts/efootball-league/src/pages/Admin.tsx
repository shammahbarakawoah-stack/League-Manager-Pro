import { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import { collection, query, where, onSnapshot, doc, updateDoc, deleteDoc } from "firebase/firestore";
import { League, Match } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { Check, X, ShieldAlert, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function Admin() {
  const { toast } = useToast();
  const [leagues, setLeagues] = useState<League[]>([]);
  const [pendingMatches, setPendingMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const leaguesQ = query(collection(db, "leagues"));
    const unsubLeagues = onSnapshot(leaguesQ, (snapshot) => {
      setLeagues(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as League)));
    });

    const matchesQ = query(collection(db, "matches"), where("status", "==", "pending_approval"));
    const unsubMatches = onSnapshot(matchesQ, (snapshot) => {
      setPendingMatches(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Match)));
      setLoading(false);
    });

    return () => {
      unsubLeagues();
      unsubMatches();
    };
  }, []);

  const handleApprove = async (matchId: string) => {
    try {
      await updateDoc(doc(db, "matches", matchId), {
        status: "approved",
        updatedAt: Date.now()
      });
      toast({ title: "Result approved" });
    } catch (error: any) {
      toast({ title: "Error approving", description: error.message, variant: "destructive" });
    }
  };

  const handleReject = async (matchId: string) => {
    try {
      await updateDoc(doc(db, "matches", matchId), {
        status: "rejected",
        homeScore: null,
        awayScore: null,
        updatedAt: Date.now()
      });
      toast({ title: "Result rejected" });
    } catch (error: any) {
      toast({ title: "Error rejecting", description: error.message, variant: "destructive" });
    }
  };

  const handleToggleLeagueStatus = async (league: League) => {
    try {
      await updateDoc(doc(db, "leagues", league.id), {
        status: league.status === "active" ? "completed" : "active"
      });
      toast({ title: `League marked as ${league.status === "active" ? "completed" : "active"}` });
    } catch (error: any) {
      toast({ title: "Error updating league", description: error.message, variant: "destructive" });
    }
  };

  const handleDeleteLeague = async (leagueId: string) => {
    if (!confirm("Are you sure you want to delete this league? This cannot be undone.")) return;
    try {
      await deleteDoc(doc(db, "leagues", leagueId));
      toast({ title: "League deleted" });
    } catch (error: any) {
      toast({ title: "Error deleting league", description: error.message, variant: "destructive" });
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto p-4 md:p-8 space-y-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-[400px] w-full" />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 md:p-8 space-y-6">
      <div className="flex items-center gap-3 mb-8">
        <ShieldAlert className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Admin Control Panel</h1>
          <p className="text-muted-foreground mt-1">Manage leagues and approve match results.</p>
        </div>
      </div>

      <Tabs defaultValue="pending" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="pending">Pending Results ({pendingMatches.length})</TabsTrigger>
          <TabsTrigger value="leagues">League Management</TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="space-y-4">
          {pendingMatches.length === 0 ? (
            <Card className="border-dashed bg-muted/20">
              <CardContent className="p-12 text-center text-muted-foreground">
                No pending results to approve.
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {pendingMatches.map(match => {
                const league = leagues.find(l => l.id === match.leagueId);
                return (
                  <Card key={match.id} className="bg-card/50">
                    <CardContent className="p-4 flex flex-col md:flex-row items-center justify-between gap-4">
                      <div className="flex-1">
                        <div className="text-xs text-primary font-medium mb-1">{league?.name}</div>
                        <div className="text-sm text-muted-foreground mb-2">
                          Submitted on {format(new Date(match.updatedAt), "MMM d, HH:mm")}
                        </div>
                        <div className="flex items-center gap-4">
                          <span className="font-semibold">{match.homeTeamName}</span>
                          <span className="px-3 py-1 font-mono font-bold bg-background border border-border rounded">
                            {match.homeScore} - {match.awayScore}
                          </span>
                          <span className="font-semibold">{match.awayTeamName}</span>
                        </div>
                      </div>
                      <div className="flex gap-2 w-full md:w-auto">
                        <Button variant="outline" className="flex-1 md:flex-none border-destructive text-destructive hover:bg-destructive/10" onClick={() => handleReject(match.id)}>
                          <X className="h-4 w-4 mr-2" /> Reject
                        </Button>
                        <Button className="flex-1 md:flex-none bg-primary text-primary-foreground hover:bg-primary/90" onClick={() => handleApprove(match.id)}>
                          <Check className="h-4 w-4 mr-2" /> Approve
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="leagues" className="space-y-4">
          {leagues.length === 0 ? (
            <Card className="border-dashed bg-muted/20">
              <CardContent className="p-12 text-center text-muted-foreground">
                No leagues created yet.
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {leagues.map(league => (
                <Card key={league.id} className="bg-card/50">
                  <CardContent className="p-4 flex flex-col md:flex-row items-center justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <h3 className="font-bold text-lg">{league.name}</h3>
                        <Badge variant={league.status === "active" ? "default" : "secondary"}>
                          {league.status}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">{league.description}</p>
                      <div className="text-xs text-muted-foreground mt-2">
                        {league.memberUids.length} members
                      </div>
                    </div>
                    <div className="flex gap-2 w-full md:w-auto">
                      <Button variant="outline" className="flex-1 md:flex-none" onClick={() => handleToggleLeagueStatus(league)}>
                        Mark {league.status === "active" ? "Completed" : "Active"}
                      </Button>
                      <Button variant="destructive" className="flex-1 md:flex-none" onClick={() => handleDeleteLeague(league.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
