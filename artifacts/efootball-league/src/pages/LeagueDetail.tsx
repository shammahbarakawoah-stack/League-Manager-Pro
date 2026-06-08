import { useState, useEffect, useMemo } from "react";
import { useParams, useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/lib/firebase";
import {
  doc, getDoc, collection, query, where, onSnapshot,
  addDoc, updateDoc, deleteDoc, writeBatch, arrayRemove
} from "firebase/firestore";
import { League, Team, Match } from "@/lib/types";
import { computeStandings, StandingsTable } from "@/components/StandingsTable";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import {
  Calendar, CheckCircle2, Shield, PlusCircle, Trophy,
  KeyRound, Copy, Trash2, LogOut, Zap, Users, Star, Target,
  UserPlus, X
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

function generateRoundRobin(teams: Team[]): { home: Team; away: Team }[][] {
  const list: (Team | null)[] = [...teams];
  if (list.length % 2 !== 0) list.push(null);
  const n = list.length;
  const rounds = n - 1;
  const matchdays: { home: Team; away: Team }[][] = [];

  for (let round = 0; round < rounds; round++) {
    const day: { home: Team; away: Team }[] = [];
    for (let i = 0; i < n / 2; i++) {
      const a = list[i];
      const b = list[n - 1 - i];
      if (a && b) {
        day.push(round % 2 === 0 ? { home: a, away: b } : { home: b, away: a });
      }
    }
    matchdays.push(day);
    const last = list.splice(n - 1, 1)[0];
    list.splice(1, 0, last);
  }
  return matchdays;
}

function getNextSunday(): number {
  const d = new Date();
  const daysUntil = (7 - d.getDay()) % 7 || 7;
  d.setDate(d.getDate() + daysUntil);
  d.setHours(15, 0, 0, 0);
  return d.getTime();
}

function generateJoinCode(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export default function LeagueDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const [league, setLeague] = useState<League | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);

  // Dialog states
  const [registerOpen, setRegisterOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [deleteTeamOpen, setDeleteTeamOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [uctOpen, setUclOpen] = useState(false);

  // Form state
  const [teamName, setTeamName] = useState("");
  const [awayTeamId, setAwayTeamId] = useState("");
  const [scheduledDate, setScheduledDate] = useState("");
  const [newSquadPlayer, setNewSquadPlayer] = useState("");

  // Loading states
  const [registerLoading, setRegisterLoading] = useState(false);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [fixtureLoading, setFixtureLoading] = useState(false);
  const [squadLoading, setSquadLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    if (!id) return;

    getDoc(doc(db, "leagues", id)).then(snap => {
      if (snap.exists()) setLeague({ id: snap.id, ...snap.data() } as League);
    });

    const unsubTeams = onSnapshot(
      query(collection(db, "teams"), where("leagueId", "==", id)),
      snap => setTeams(snap.docs.map(d => ({ id: d.id, ...d.data() } as Team)))
    );

    const unsubMatches = onSnapshot(
      query(collection(db, "matches"), where("leagueId", "==", id)),
      snap => {
        setMatches(snap.docs.map(d => ({ id: d.id, ...d.data() } as Match)));
        setLoading(false);
      }
    );

    return () => { unsubTeams(); unsubMatches(); };
  }, [id]);

  // Derived
  const userTeam = useMemo(() => teams.find(t => t.ownerUid === user?.uid) ?? null, [teams, user]);
  const isAdmin = user?.uid === league?.adminUid;
  const approvedMatches = useMemo(() => matches.filter(m => m.status === "approved"), [matches]);
  const scheduledMatches = useMemo(() =>
    matches.filter(m => m.status === "scheduled").sort((a, b) => a.scheduledDate - b.scheduledDate),
    [matches]
  );
  const matchResults = useMemo(() =>
    approvedMatches.slice().sort((a, b) => b.updatedAt - a.updatedAt),
    [approvedMatches]
  );

  // Group fixtures by matchday
  const fixturesByMatchday = useMemo(() => {
    const groups: Record<number, Match[]> = {};
    scheduledMatches.forEach(m => {
      const day = m.matchday ?? 0;
      if (!groups[day]) groups[day] = [];
      groups[day].push(m);
    });
    return groups;
  }, [scheduledMatches]);

  // Top scorers & assists
  const topScorers = useMemo(() => {
    const counts: Record<string, number> = {};
    approvedMatches.forEach(m => {
      (m.scorers || []).forEach(name => { counts[name] = (counts[name] || 0) + 1; });
    });
    return Object.entries(counts).sort(([, a], [, b]) => b - a).slice(0, 10)
      .map(([name, goals]) => ({ name, goals }));
  }, [approvedMatches]);

  const topAssists = useMemo(() => {
    const counts: Record<string, number> = {};
    approvedMatches.forEach(m => {
      (m.assists || []).forEach(name => { counts[name] = (counts[name] || 0) + 1; });
    });
    return Object.entries(counts).sort(([, a], [, b]) => b - a).slice(0, 10)
      .map(([name, assists]) => ({ name, assists }));
  }, [approvedMatches]);

  // ── Fixture generation ──────────────────────────────────────────────────────
  const generateFixtures = async () => {
    if (!league || teams.length < 2) {
      toast({ title: "Need at least 2 teams to generate fixtures", variant: "destructive" });
      return;
    }
    setFixtureLoading(true);
    try {
      const matchdays = generateRoundRobin(teams);
      const totalMatchdays = matchdays.length;
      const startDate = getNextSunday();
      const batch = writeBatch(db);

      // First leg
      matchdays.forEach((day, dayIdx) => {
        const ts = startDate + dayIdx * WEEK_MS;
        day.forEach(({ home, away }) => {
          const ref = doc(collection(db, "matches"));
          batch.set(ref, {
            leagueId: league.id,
            homeTeamId: home.id, awayTeamId: away.id,
            homeTeamName: home.name, awayTeamName: away.name,
            scheduledDate: ts, status: "scheduled",
            leg: 1, matchday: dayIdx + 1,
            createdAt: Date.now(), updatedAt: Date.now()
          });
        });
      });

      // Second leg (home/away reversed)
      matchdays.forEach((day, dayIdx) => {
        const ts = startDate + (totalMatchdays + dayIdx) * WEEK_MS;
        day.forEach(({ home, away }) => {
          const ref = doc(collection(db, "matches"));
          batch.set(ref, {
            leagueId: league.id,
            homeTeamId: away.id, awayTeamId: home.id,
            homeTeamName: away.name, awayTeamName: home.name,
            scheduledDate: ts, status: "scheduled",
            leg: 2, matchday: totalMatchdays + dayIdx + 1,
            createdAt: Date.now(), updatedAt: Date.now()
          });
        });
      });

      await batch.commit();
      const total = teams.length * (teams.length - 1);
      toast({ title: `Generated ${total} fixtures across ${totalMatchdays * 2} matchdays!` });
    } catch (e: any) {
      toast({ title: "Failed to generate fixtures", description: e.message, variant: "destructive" });
    } finally {
      setFixtureLoading(false);
    }
  };

  // ── Register team ───────────────────────────────────────────────────────────
  const onRegisterTeam = async () => {
    if (!user || !league) return;
    const name = teamName.trim();
    if (name.length < 2) { toast({ title: "Team name too short", variant: "destructive" }); return; }
    setRegisterLoading(true);
    try {
      await addDoc(collection(db, "teams"), {
        name, leagueId: league.id, ownerUid: user.uid,
        logoURL: null, squad: [], createdAt: Date.now()
      });
      setRegisterOpen(false);
      setTeamName("");
      toast({ title: "Team registered!" });
    } catch (e: any) {
      toast({ title: "Failed", description: e.message, variant: "destructive" });
    } finally {
      setRegisterLoading(false);
    }
  };

  // ── Schedule match ──────────────────────────────────────────────────────────
  const onScheduleMatch = async () => {
    if (!user || !league || !userTeam) return;
    const away = teams.find(t => t.id === awayTeamId);
    if (!away) { toast({ title: "Select an opponent", variant: "destructive" }); return; }
    if (!scheduledDate) { toast({ title: "Select a date and time", variant: "destructive" }); return; }
    setScheduleLoading(true);
    try {
      await addDoc(collection(db, "matches"), {
        leagueId: league.id,
        homeTeamId: userTeam.id, awayTeamId: away.id,
        homeTeamName: userTeam.name, awayTeamName: away.name,
        scheduledDate: new Date(scheduledDate).getTime(),
        status: "scheduled", createdAt: Date.now(), updatedAt: Date.now()
      });
      setScheduleOpen(false);
      setAwayTeamId(""); setScheduledDate("");
      toast({ title: "Match scheduled!" });
    } catch (e: any) {
      toast({ title: "Failed", description: e.message, variant: "destructive" });
    } finally {
      setScheduleLoading(false);
    }
  };

  // ── Delete my team ──────────────────────────────────────────────────────────
  const deleteMyTeam = async () => {
    if (!userTeam) return;
    setActionLoading(true);
    try {
      await deleteDoc(doc(db, "teams", userTeam.id));
      setDeleteTeamOpen(false);
      toast({ title: "Team deleted" });
    } catch (e: any) {
      toast({ title: "Failed", description: e.message, variant: "destructive" });
    } finally {
      setActionLoading(false);
    }
  };

  // ── Leave league ────────────────────────────────────────────────────────────
  const leaveLeague = async () => {
    if (!user || !league) return;
    setActionLoading(true);
    try {
      if (userTeam) await deleteDoc(doc(db, "teams", userTeam.id));
      await updateDoc(doc(db, "leagues", league.id), {
        memberUids: arrayRemove(user.uid)
      });
      toast({ title: `Left ${league.name}` });
      navigate("/leagues");
    } catch (e: any) {
      toast({ title: "Failed", description: e.message, variant: "destructive" });
    } finally {
      setActionLoading(false);
    }
  };

  // ── Squad management ────────────────────────────────────────────────────────
  const addSquadPlayer = async () => {
    if (!userTeam || !newSquadPlayer.trim()) return;
    const name = newSquadPlayer.trim();
    const current = userTeam.squad || [];
    if (current.includes(name)) { toast({ title: "Player already in squad" }); return; }
    setSquadLoading(true);
    try {
      await updateDoc(doc(db, "teams", userTeam.id), { squad: [...current, name] });
      setNewSquadPlayer("");
    } catch (e: any) {
      toast({ title: "Failed", description: e.message, variant: "destructive" });
    } finally {
      setSquadLoading(false);
    }
  };

  const removeSquadPlayer = async (name: string) => {
    if (!userTeam) return;
    try {
      await updateDoc(doc(db, "teams", userTeam.id), {
        squad: (userTeam.squad || []).filter(p => p !== name)
      });
    } catch (e: any) {
      toast({ title: "Failed", description: e.message, variant: "destructive" });
    }
  };

  // ── UCL / Europa promotion ──────────────────────────────────────────────────
  const createCompetition = async (name: string, memberUids: string[]) => {
    const code = generateJoinCode();
    const ref = await addDoc(collection(db, "leagues"), {
      name, description: `Promoted from ${league!.name}`,
      adminUid: user!.uid, createdAt: Date.now(),
      status: "active", memberUids, joinCode: code
    });
    return ref.id;
  };

  const promoteToCompetitions = async () => {
    if (!league || !user) return;
    setActionLoading(true);
    try {
      const sorted = computeStandings(teams, matches);
      const ucl = sorted.slice(0, 6);
      const europa = sorted.slice(6);

      // UCL: 2 groups of 3
      const groupA = [ucl[0], ucl[2], ucl[4]].filter(Boolean);
      const groupB = [ucl[1], ucl[3], ucl[5]].filter(Boolean);
      const uidGroupA = groupA.map(t => t.ownerUid);
      const uidGroupB = groupB.map(t => t.ownerUid);
      const uidEuropa = europa.map(t => t.ownerUid);

      const promises = [];
      if (uidGroupA.length >= 2)
        promises.push(createCompetition(`${league.name} — UCL Group A`, uidGroupA));
      if (uidGroupB.length >= 2)
        promises.push(createCompetition(`${league.name} — UCL Group B`, uidGroupB));
      if (uidEuropa.length >= 2)
        promises.push(createCompetition(`${league.name} — Europa League`, uidEuropa));

      await Promise.all(promises);
      setUclOpen(false);
      toast({ title: "Competitions created! Go to Leagues to see them." });
    } catch (e: any) {
      toast({ title: "Failed", description: e.message, variant: "destructive" });
    } finally {
      setActionLoading(false);
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
        <Skeleton className="h-12 w-1/3" /><Skeleton className="h-6 w-1/4" /><Skeleton className="h-96 w-full mt-8" />
      </div>
    );
  }
  if (!league) {
    return <div className="container mx-auto p-8 text-center"><h2 className="text-2xl font-bold">League not found</h2></div>;
  }

  const userHasTeam = !!userTeam;
  const sorted = computeStandings(teams, matches);

  return (
    <div className="container mx-auto p-4 md:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start gap-4 border-b border-border/50 pb-6">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-3xl font-bold tracking-tight">{league.name}</h1>
            <Badge variant={league.status === "active" ? "default" : "secondary"}>{league.status}</Badge>
          </div>
          {league.description && <p className="text-muted-foreground mt-1 max-w-2xl">{league.description}</p>}
          {isAdmin && league.joinCode && (
            <div className="flex items-center gap-2 mt-2">
              <KeyRound className="h-4 w-4 text-primary" />
              <span className="text-sm text-muted-foreground">Join code:</span>
              <span className="font-mono font-bold text-primary tracking-widest text-lg">{league.joinCode}</span>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={copyJoinCode}><Copy className="h-3 w-3" /></Button>
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          {/* Generate Fixtures — admin only */}
          {isAdmin && teams.length >= 2 && (
            <Button variant="outline" className="gap-2" onClick={generateFixtures} disabled={fixtureLoading}>
              <Zap className="h-4 w-4" />
              {fixtureLoading ? "Generating…" : "Generate Fixtures"}
            </Button>
          )}

          {/* UCL/Europa — admin, completed league, 6+ teams */}
          {isAdmin && league.status === "completed" && sorted.length >= 4 && (
            <Button variant="outline" className="gap-2 border-yellow-500/50 text-yellow-400 hover:bg-yellow-500/10"
              onClick={() => setUclOpen(true)}>
              <Star className="h-4 w-4" /> Create UCL & Europa
            </Button>
          )}

          {/* Register team */}
          {!userHasTeam && (
            <Button className="gap-2" onClick={() => setRegisterOpen(true)}>
              <Shield className="h-4 w-4" /> Register Team
            </Button>
          )}

          {/* Schedule match */}
          {userHasTeam && teams.length >= 2 && (
            <Button variant="secondary" className="gap-2" onClick={() => setScheduleOpen(true)}>
              <PlusCircle className="h-4 w-4" /> Schedule Match
            </Button>
          )}

          {/* Delete team */}
          {userHasTeam && (
            <Button variant="outline" className="gap-2 border-destructive/50 text-destructive hover:bg-destructive/10"
              onClick={() => setDeleteTeamOpen(true)}>
              <Trash2 className="h-4 w-4" /> Delete Team
            </Button>
          )}

          {/* Leave league */}
          <Button variant="ghost" className="gap-2 text-muted-foreground hover:text-destructive"
            onClick={() => setLeaveOpen(true)}>
            <LogOut className="h-4 w-4" /> Leave
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="standings" className="w-full">
        <TabsList className="mb-4 flex-wrap h-auto gap-1">
          <TabsTrigger value="standings" className="gap-1.5"><Trophy className="h-4 w-4" />Standings</TabsTrigger>
          <TabsTrigger value="fixtures" className="gap-1.5"><Calendar className="h-4 w-4" />Fixtures</TabsTrigger>
          <TabsTrigger value="results" className="gap-1.5"><CheckCircle2 className="h-4 w-4" />Results</TabsTrigger>
          <TabsTrigger value="stats" className="gap-1.5"><Target className="h-4 w-4" />Stats</TabsTrigger>
          <TabsTrigger value="teams" className="gap-1.5"><Users className="h-4 w-4" />Teams</TabsTrigger>
          {userHasTeam && <TabsTrigger value="squad" className="gap-1.5"><UserPlus className="h-4 w-4" />My Squad</TabsTrigger>}
        </TabsList>

        {/* Standings */}
        <TabsContent value="standings">
          <StandingsTable teams={teams} matches={matches} />
        </TabsContent>

        {/* Fixtures */}
        <TabsContent value="fixtures" className="space-y-6">
          {scheduledMatches.length === 0 ? (
            <Card className="border-dashed bg-muted/20">
              <CardContent className="p-8 text-center text-muted-foreground">
                {isAdmin && teams.length >= 2
                  ? 'No fixtures yet. Click "Generate Fixtures" to auto-schedule all matches.'
                  : "No fixtures scheduled yet."}
              </CardContent>
            </Card>
          ) : (
            Object.entries(fixturesByMatchday)
              .sort(([a], [b]) => Number(a) - Number(b))
              .map(([matchday, dayMatches]) => (
                <div key={matchday} className="space-y-2">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                      {Number(matchday) === 0 ? "Unscheduled" : `Matchday ${matchday}`}
                      {dayMatches[0]?.leg ? ` · Leg ${dayMatches[0].leg}` : ""}
                    </h3>
                    <div className="text-xs text-muted-foreground">
                      {format(new Date(dayMatches[0].scheduledDate), "EEE d MMM")}
                    </div>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    {dayMatches.map(match => (
                      <Card key={match.id} className="bg-card/50">
                        <CardContent className="p-3 flex items-center justify-between gap-2">
                          <div className="flex-1 font-semibold text-right text-sm truncate">{match.homeTeamName}</div>
                          <div className="text-xs text-muted-foreground font-mono bg-accent px-2 py-1 rounded shrink-0">VS</div>
                          <div className="flex-1 font-semibold text-sm truncate">{match.awayTeamName}</div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              ))
          )}
        </TabsContent>

        {/* Results */}
        <TabsContent value="results" className="space-y-4">
          {matchResults.length === 0 ? (
            <Card className="border-dashed bg-muted/20">
              <CardContent className="p-8 text-center text-muted-foreground">No results yet.</CardContent>
            </Card>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {matchResults.map(match => (
                <Card key={match.id} className="bg-card/50 border-l-4 border-l-primary">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex-1 font-semibold text-right text-sm">{match.homeTeamName}</div>
                      <div className="px-4 font-mono text-xl font-bold bg-background mx-3 py-1 rounded border border-border">{match.homeScore} - {match.awayScore}</div>
                      <div className="flex-1 font-semibold text-sm">{match.awayTeamName}</div>
                    </div>
                    {(match.scorers?.length || match.assists?.length) ? (
                      <div className="mt-2 pt-2 border-t border-border/40 text-xs text-muted-foreground space-y-0.5">
                        {match.scorers?.length ? <div><span className="text-foreground font-medium">Goals:</span> {match.scorers.join(", ")}</div> : null}
                        {match.assists?.length ? <div><span className="text-foreground font-medium">Assists:</span> {match.assists.join(", ")}</div> : null}
                      </div>
                    ) : null}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Stats */}
        <TabsContent value="stats">
          <div className="grid gap-6 md:grid-cols-2">
            <Card className="bg-card/50">
              <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Target className="h-4 w-4 text-primary" />Top Scorers</CardTitle></CardHeader>
              <CardContent>
                {topScorers.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No goals recorded yet. Add scorer names when submitting match results.</p>
                ) : (
                  <div className="space-y-2">
                    {topScorers.map((s, i) => (
                      <div key={s.name} className="flex items-center gap-3 p-2 rounded-lg hover:bg-accent/30">
                        <span className="w-6 text-center text-sm font-bold text-muted-foreground">{i + 1}</span>
                        <div className="flex-1 font-medium text-sm">{s.name}</div>
                        <div className="font-bold text-primary">{s.goals} <span className="text-xs font-normal text-muted-foreground">goals</span></div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
            <Card className="bg-card/50">
              <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Star className="h-4 w-4 text-primary" />Top Assists</CardTitle></CardHeader>
              <CardContent>
                {topAssists.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No assists recorded yet. Add assist names when submitting match results.</p>
                ) : (
                  <div className="space-y-2">
                    {topAssists.map((a, i) => (
                      <div key={a.name} className="flex items-center gap-3 p-2 rounded-lg hover:bg-accent/30">
                        <span className="w-6 text-center text-sm font-bold text-muted-foreground">{i + 1}</span>
                        <div className="flex-1 font-medium text-sm">{a.name}</div>
                        <div className="font-bold text-primary">{a.assists} <span className="text-xs font-normal text-muted-foreground">assists</span></div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Teams */}
        <TabsContent value="teams">
          {teams.length === 0 ? (
            <Card className="border-dashed bg-muted/20"><CardContent className="p-8 text-center text-muted-foreground">No teams registered yet.</CardContent></Card>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
              {teams.map(team => (
                <Card key={team.id} className="bg-card/50">
                  <CardContent className="flex flex-col items-center gap-2 p-5">
                    <Avatar className="h-16 w-16 rounded-xl border-2 border-border">
                      <AvatarFallback className="rounded-xl text-xl font-bold">{(team.name ?? "??").substring(0, 2).toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <span className="font-semibold text-center">{team.name}</span>
                    {team.squad?.length ? <span className="text-xs text-muted-foreground">{team.squad.length} players</span> : null}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Squad */}
        {userHasTeam && (
          <TabsContent value="squad" className="space-y-4">
            <Card className="bg-card/50">
              <CardHeader>
                <CardTitle className="text-base">{userTeam!.name} — eFootball Squad</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
                  <Input
                    placeholder="Player name"
                    value={newSquadPlayer}
                    onChange={e => setNewSquadPlayer(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && addSquadPlayer()}
                  />
                  <Button onClick={addSquadPlayer} disabled={squadLoading || !newSquadPlayer.trim()}>Add</Button>
                </div>
                {!userTeam!.squad?.length ? (
                  <p className="text-sm text-muted-foreground">No players added yet.</p>
                ) : (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {userTeam!.squad!.map((player, i) => (
                      <div key={player} className="flex items-center gap-3 p-2 rounded-lg border border-border/50 bg-background/50">
                        <span className="w-6 text-center text-xs text-muted-foreground font-bold">{i + 1}</span>
                        <span className="flex-1 text-sm font-medium">{player}</span>
                        <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive"
                          onClick={() => removeSquadPlayer(player)}>
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>

      {/* ── Dialogs ───────────────────────────────────────────────────────────── */}

      {/* Register Team */}
      <Dialog open={registerOpen} onOpenChange={o => { setRegisterOpen(o); if (!o) setTeamName(""); }}>
        <DialogContent className="sm:max-w-[360px]">
          <DialogHeader><DialogTitle>Register Your Team</DialogTitle><DialogDescription>Enter your team name to compete in this league.</DialogDescription></DialogHeader>
          <div className="space-y-3 pt-2">
            <Label htmlFor="reg-name">Team Name</Label>
            <Input id="reg-name" placeholder="e.g. Manchester Blues" value={teamName} onChange={e => setTeamName(e.target.value)} onKeyDown={e => e.key === "Enter" && onRegisterTeam()} />
          </div>
          <DialogFooter className="pt-2">
            <Button onClick={onRegisterTeam} disabled={registerLoading} className="w-full">{registerLoading ? "Registering…" : "Register Team"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Schedule Match */}
      <Dialog open={scheduleOpen} onOpenChange={o => { setScheduleOpen(o); if (!o) { setAwayTeamId(""); setScheduledDate(""); } }}>
        <DialogContent className="sm:max-w-[360px]">
          <DialogHeader><DialogTitle>Schedule a Match</DialogTitle><DialogDescription>Arrange a match against another team.</DialogDescription></DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>Opponent</Label>
              <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={awayTeamId} onChange={e => setAwayTeamId(e.target.value)}>
                <option value="">Select a team…</option>
                {teams.filter(t => t.ownerUid !== user?.uid).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <Label>Date & Time</Label>
              <Input type="datetime-local" value={scheduledDate} onChange={e => setScheduledDate(e.target.value)} />
            </div>
          </div>
          <DialogFooter className="pt-2">
            <Button onClick={onScheduleMatch} disabled={scheduleLoading} className="w-full">{scheduleLoading ? "Scheduling…" : "Schedule"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Team */}
      <Dialog open={deleteTeamOpen} onOpenChange={setDeleteTeamOpen}>
        <DialogContent className="sm:max-w-[360px]">
          <DialogHeader><DialogTitle>Delete Team</DialogTitle><DialogDescription>This will permanently delete <strong>{userTeam?.name}</strong>. Past match records are kept. This cannot be undone.</DialogDescription></DialogHeader>
          <DialogFooter className="pt-2 gap-2">
            <Button variant="outline" onClick={() => setDeleteTeamOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={deleteMyTeam} disabled={actionLoading}>{actionLoading ? "Deleting…" : "Delete Team"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Leave League */}
      <Dialog open={leaveOpen} onOpenChange={setLeaveOpen}>
        <DialogContent className="sm:max-w-[380px]">
          <DialogHeader><DialogTitle>Leave League</DialogTitle>
            <DialogDescription>
              Are you sure you want to leave <strong>{league.name}</strong>?
              {userTeam && " Your team will also be deleted."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="pt-2 gap-2">
            <Button variant="outline" onClick={() => setLeaveOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={leaveLeague} disabled={actionLoading}>{actionLoading ? "Leaving…" : "Leave League"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* UCL / Europa Promotion */}
      <Dialog open={uctOpen} onOpenChange={setUclOpen}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>Create UCL & Europa League</DialogTitle>
            <DialogDescription>
              Based on current standings, this will create:
              <ul className="mt-2 space-y-1 text-sm">
                <li><strong className="text-primary">UCL Group A</strong> — {sorted[0]?.name}, {sorted[2]?.name}{sorted[4] ? `, ${sorted[4].name}` : ""}</li>
                <li><strong className="text-primary">UCL Group B</strong> — {sorted[1]?.name}, {sorted[3]?.name}{sorted[5] ? `, ${sorted[5].name}` : ""}</li>
                {sorted.length > 6 && <li><strong className="text-orange-400">Europa League</strong> — {sorted.slice(6).map(t => t.name).join(", ")}</li>}
              </ul>
              <p className="mt-2">Each competition gets its own league. Admins generate fixtures to start group stage play.</p>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="pt-2 gap-2">
            <Button variant="outline" onClick={() => setUclOpen(false)}>Cancel</Button>
            <Button onClick={promoteToCompetitions} disabled={actionLoading}>{actionLoading ? "Creating…" : "Create Competitions"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
