import { useState, useEffect } from "react";
import { useParams } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/lib/firebase";
import { doc, getDoc, collection, query, where, onSnapshot, addDoc } from "firebase/firestore";
import { League, Team, Match } from "@/lib/types";
import { StandingsTable } from "@/components/StandingsTable";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { Calendar, CheckCircle2, Shield, PlusCircle, Trophy, KeyRound, Copy } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function LeagueDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { toast } = useToast();

  const [league, setLeague] = useState<League | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);

  const [isRegisterTeamOpen, setIsRegisterTeamOpen] = useState(false);
  const [isScheduleMatchOpen, setIsScheduleMatchOpen] = useState(false);
  const [teamName, setTeamName] = useState("");
  const [registerLoading, setRegisterLoading] = useState(false);
  const [awayTeamId, setAwayTeamId] = useState("");
  const [scheduledDate, setScheduledDate] = useState("");
  const [scheduleLoading, setScheduleLoading] = useState(false);

  useEffect(() => {
    if (!id) return;

    const fetchLeague = async () => {
      try {
        const leagueDoc = await getDoc(doc(db, "leagues", id));
        if (leagueDoc.exists()) {
          setLeague({ id: leagueDoc.id, ...leagueDoc.data() } as League);
        }
      } catch (error) {
        console.error("Error fetching league:", error);
      }
    };
    fetchLeague();

    const unsubscribeTeams = onSnapshot(
      query(collection(db, "teams"), where("leagueId", "==", id)),
      (snapshot) => setTeams(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Team)))
    );

    const unsubscribeMatches = onSnapshot(
      query(collection(db, "matches"), where("leagueId", "==", id)),
      (snapshot) => {
        setMatches(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Match)));
        setLoading(false);
      }
    );

    return () => { unsubscribeTeams(); unsubscribeMatches(); };
  }, [id]);

  const onRegisterTeam = async () => {
    if (!user || !league) return;
    const name = teamName.trim();
    if (name.length < 2) {
      toast({ title: "Team name must be at least 2 characters", variant: "destructive" });
      return;
    }
    setRegisterLoading(true);
    try {
      await addDoc(collection(db, "teams"), {
        name,
        leagueId: league.id,
        ownerUid: user.uid,
        logoURL: null,
        createdAt: Date.now()
      });
      setIsRegisterTeamOpen(false);
      setTeamName("");
      toast({ title: "Team registered successfully!" });
    } catch (error: any) {
      toast({ title: "Failed to register team", description: error.message, variant: "destructive" });
    } finally {
      setRegisterLoading(false);
    }
  };

  const onScheduleMatch = async () => {
    if (!user || !league) return;
    const userTeam = teams.find(t => t.ownerUid === user.uid);
    const awayTeam = teams.find(t => t.id === awayTeamId);

    if (!userTeam || !awayTeam) {
      toast({ title: "Could not find teams", variant: "destructive" });
      return;
    }
    if (!scheduledDate) {
      toast({ title: "Please select a date and time", variant: "destructive" });
      return;
    }
    setScheduleLoading(true);
    try {
      await addDoc(collection(db, "matches"), {
        leagueId: league.id,
        homeTeamId: userTeam.id,
        awayTeamId: awayTeam.id,
        homeTeamName: userTeam.name,
        awayTeamName: awayTeam.name,
        scheduledDate: new Date(scheduledDate).getTime(),
        status: "scheduled",
        createdAt: Date.now(),
        updatedAt: Date.now()
      });
      setIsScheduleMatchOpen(false);
      setAwayTeamId("");
      setScheduledDate("");
      toast({ title: "Match scheduled successfully!" });
    } catch (error: any) {
      toast({ title: "Failed to schedule match", description: error.message, variant: "destructive" });
    } finally {
      setScheduleLoading(false);
    }
  };

  const copyJoinCode = () => {
    if (!league?.joinCode) return;
    navigator.clipboard.writeText(league.joinCode);
    toast({ title: "Join code copied!" });
  };

  if (loading) {
    return (
      <div className="container mx-auto p-4 md:p-8 space-y-6">
        <Skeleton className="h-12 w-1/3" />
        <Skeleton className="h-6 w-1/4" />
        <Skeleton className="h-96 w-full mt-8" />
      </div>
    );
  }

  if (!league) {
    return (
      <div className="container mx-auto p-8 text-center">
        <h2 className="text-2xl font-bold">League not found</h2>
      </div>
    );
  }

  const userHasTeam = teams.some(t => t.ownerUid === user?.uid);
  const isAdmin = user?.uid === league.adminUid;
  const scheduledMatches = matches.filter(m => m.status === "scheduled");
  const approvedMatches = matches.filter(m => m.status === "approved").sort((a, b) => b.updatedAt - a.updatedAt);

  return (
    <div className="container mx-auto p-4 md:p-8 space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-border/50 pb-6">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-3xl font-bold tracking-tight">{league.name}</h1>
            <Badge variant={league.status === "active" ? "default" : "secondary"}>{league.status}</Badge>
          </div>
          <p className="text-muted-foreground mt-2 max-w-2xl">{league.description}</p>
          {isAdmin && league.joinCode && (
            <div className="flex items-center gap-2 mt-3">
              <KeyRound className="h-4 w-4 text-primary" />
              <span className="text-sm text-muted-foreground">Join code:</span>
              <span className="font-mono font-bold text-primary tracking-widest text-lg">{league.joinCode}</span>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={copyJoinCode}>
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </div>

        <div className="flex gap-2 flex-wrap">
          {!userHasTeam && (
            <Dialog open={isRegisterTeamOpen} onOpenChange={(open) => { setIsRegisterTeamOpen(open); if (!open) setTeamName(""); }}>
              <DialogTrigger asChild>
                <Button className="gap-2">
                  <Shield className="h-4 w-4" />
                  Register Team
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[380px]">
                <DialogHeader>
                  <DialogTitle>Register Your Team</DialogTitle>
                  <DialogDescription>Enter your team name to compete in this league.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 pt-4">
                  <div className="space-y-2">
                    <Label htmlFor="team-name">Team Name</Label>
                    <Input
                      id="team-name"
                      placeholder="e.g. Manchester Blues"
                      value={teamName}
                      onChange={(e) => setTeamName(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && onRegisterTeam()}
                    />
                  </div>
                </div>
                <DialogFooter className="pt-2">
                  <Button onClick={onRegisterTeam} disabled={registerLoading} className="w-full">
                    {registerLoading ? "Registering..." : "Register Team"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}

          {userHasTeam && (
            <Dialog open={isScheduleMatchOpen} onOpenChange={(open) => { setIsScheduleMatchOpen(open); if (!open) { setAwayTeamId(""); setScheduledDate(""); } }}>
              <DialogTrigger asChild>
                <Button variant="secondary" className="gap-2">
                  <PlusCircle className="h-4 w-4" />
                  Schedule Match
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[380px]">
                <DialogHeader>
                  <DialogTitle>Schedule a Match</DialogTitle>
                  <DialogDescription>Arrange a match against another team in this league.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 pt-4">
                  <div className="space-y-2">
                    <Label htmlFor="opponent">Opponent</Label>
                    <select
                      id="opponent"
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      value={awayTeamId}
                      onChange={(e) => setAwayTeamId(e.target.value)}
                    >
                      <option value="">Select a team...</option>
                      {teams.filter(t => t.ownerUid !== user?.uid).map(t => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="match-date">Date & Time</Label>
                    <Input
                      id="match-date"
                      type="datetime-local"
                      value={scheduledDate}
                      onChange={(e) => setScheduledDate(e.target.value)}
                    />
                  </div>
                </div>
                <DialogFooter className="pt-2">
                  <Button onClick={onScheduleMatch} disabled={scheduleLoading} className="w-full">
                    {scheduleLoading ? "Scheduling..." : "Schedule Match"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      <Tabs defaultValue="standings" className="w-full">
        <TabsList className="mb-4 flex-wrap h-auto">
          <TabsTrigger value="standings" className="gap-2"><Trophy className="h-4 w-4" /> Standings</TabsTrigger>
          <TabsTrigger value="fixtures" className="gap-2"><Calendar className="h-4 w-4" /> Fixtures</TabsTrigger>
          <TabsTrigger value="results" className="gap-2"><CheckCircle2 className="h-4 w-4" /> Results</TabsTrigger>
        </TabsList>

        <TabsContent value="standings">
          <StandingsTable teams={teams} matches={matches} />
        </TabsContent>

        <TabsContent value="fixtures" className="space-y-4">
          {scheduledMatches.length === 0 ? (
            <Card className="border-dashed bg-muted/20">
              <CardContent className="p-8 text-center text-muted-foreground">No fixtures scheduled.</CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {scheduledMatches.sort((a, b) => a.scheduledDate - b.scheduledDate).map(match => (
                <Card key={match.id} className="bg-card/50">
                  <CardContent className="p-4 flex items-center justify-between">
                    <div className="flex-1 font-semibold text-right">{match.homeTeamName}</div>
                    <div className="px-4 text-xs text-muted-foreground flex flex-col items-center gap-1">
                      <div className="px-2 py-1 bg-accent rounded font-mono">VS</div>
                      <div className="whitespace-nowrap">{format(new Date(match.scheduledDate), "MMM d, HH:mm")}</div>
                    </div>
                    <div className="flex-1 font-semibold">{match.awayTeamName}</div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="results" className="space-y-4">
          {approvedMatches.length === 0 ? (
            <Card className="border-dashed bg-muted/20">
              <CardContent className="p-8 text-center text-muted-foreground">No results recorded yet.</CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {approvedMatches.map(match => (
                <Card key={match.id} className="bg-card/50 border-l-4 border-l-primary">
                  <CardContent className="p-4 flex items-center justify-between">
                    <div className="flex-1 font-semibold text-right">{match.homeTeamName}</div>
                    <div className="px-6 font-mono text-xl font-bold bg-background mx-4 py-1 rounded border border-border">
                      {match.homeScore} - {match.awayScore}
                    </div>
                    <div className="flex-1 font-semibold">{match.awayTeamName}</div>
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
