import { useState, useEffect, useRef } from "react";
import { useParams } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/lib/firebase";
import { doc, getDoc, collection, query, where, onSnapshot, addDoc } from "firebase/firestore";
import { League, Team, Match } from "@/lib/types";
import { StandingsTable } from "@/components/StandingsTable";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { Calendar, CheckCircle2, Shield, PlusCircle, Trophy, Upload, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

const teamSchema = z.object({
  name: z.string().min(2).max(50),
});

const matchSchema = z.object({
  awayTeamId: z.string().min(1, "Select an opponent"),
  scheduledDate: z.string().min(1, "Select a date"),
});

function resizeImageToBase64(file: File, maxSize = 256): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const scale = Math.min(maxSize / img.width, maxSize / img.height, 1);
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/webp", 0.85));
      };
      img.onerror = reject;
      img.src = e.target!.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

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

  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoBase64, setLogoBase64] = useState<string | null>(null);
  const [logoError, setLogoError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const teamForm = useForm<z.infer<typeof teamSchema>>({
    resolver: zodResolver(teamSchema),
    defaultValues: { name: "" },
  });

  const matchForm = useForm<z.infer<typeof matchSchema>>({
    resolver: zodResolver(matchSchema),
    defaultValues: { awayTeamId: "", scheduledDate: "" },
  });

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

    const teamsQ = query(collection(db, "teams"), where("leagueId", "==", id));
    const unsubscribeTeams = onSnapshot(teamsQ, (snapshot) => {
      setTeams(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Team)));
    });

    const matchesQ = query(collection(db, "matches"), where("leagueId", "==", id));
    const unsubscribeMatches = onSnapshot(matchesQ, (snapshot) => {
      setMatches(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Match)));
      setLoading(false);
    });

    return () => {
      unsubscribeTeams();
      unsubscribeMatches();
    };
  }, [id]);

  const handleLogoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setLogoError("Please select an image file.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setLogoError("Image must be under 5MB.");
      return;
    }

    setLogoError(null);
    try {
      const base64 = await resizeImageToBase64(file);
      setLogoBase64(base64);
      setLogoPreview(base64);
    } catch {
      setLogoError("Failed to process image. Try another file.");
    }
  };

  const clearLogo = () => {
    setLogoBase64(null);
    setLogoPreview(null);
    setLogoError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const onRegisterTeam = async (values: z.infer<typeof teamSchema>) => {
    if (!user || !league) return;
    try {
      await addDoc(collection(db, "teams"), {
        name: values.name,
        leagueId: league.id,
        ownerUid: user.uid,
        logoURL: logoBase64 || null,
        createdAt: Date.now()
      });
      setIsRegisterTeamOpen(false);
      teamForm.reset();
      clearLogo();
      toast({ title: "Team registered successfully!" });
    } catch (error: any) {
      toast({ title: "Failed to register team", description: error.message, variant: "destructive" });
    }
  };

  const onScheduleMatch = async (values: z.infer<typeof matchSchema>) => {
    if (!user || !league) return;
    const userTeam = teams.find(t => t.ownerUid === user.uid);
    const awayTeam = teams.find(t => t.id === values.awayTeamId);

    if (!userTeam || !awayTeam) {
      toast({ title: "Error", description: "Could not find teams", variant: "destructive" });
      return;
    }

    try {
      await addDoc(collection(db, "matches"), {
        leagueId: league.id,
        homeTeamId: userTeam.id,
        awayTeamId: awayTeam.id,
        homeTeamName: userTeam.name,
        awayTeamName: awayTeam.name,
        scheduledDate: new Date(values.scheduledDate).getTime(),
        status: "scheduled",
        createdAt: Date.now(),
        updatedAt: Date.now()
      });
      setIsScheduleMatchOpen(false);
      matchForm.reset();
      toast({ title: "Match scheduled successfully!" });
    } catch (error: any) {
      toast({ title: "Failed to schedule match", description: error.message, variant: "destructive" });
    }
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
  const scheduledMatches = matches.filter(m => m.status === "scheduled");
  const approvedMatches = matches.filter(m => m.status === "approved").sort((a, b) => b.updatedAt - a.updatedAt);

  return (
    <div className="container mx-auto p-4 md:p-8 space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-border/50 pb-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight">{league.name}</h1>
            <Badge variant={league.status === "active" ? "default" : "secondary"}>{league.status}</Badge>
          </div>
          <p className="text-muted-foreground mt-2 max-w-2xl">{league.description}</p>
        </div>

        <div className="flex gap-2">
          {!userHasTeam && (
            <Dialog open={isRegisterTeamOpen} onOpenChange={(open) => { setIsRegisterTeamOpen(open); if (!open) { teamForm.reset(); clearLogo(); } }}>
              <DialogTrigger asChild>
                <Button className="gap-2">
                  <Shield className="h-4 w-4" />
                  Register Team
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Register Your Team</DialogTitle>
                  <DialogDescription>Enter your team details to compete in this league.</DialogDescription>
                </DialogHeader>
                <Form {...teamForm}>
                  <form onSubmit={teamForm.handleSubmit(onRegisterTeam)} className="space-y-5 pt-4">
                    <FormField
                      control={teamForm.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Team Name</FormLabel>
                          <FormControl>
                            <Input placeholder="e.g. Manchester Blues" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="space-y-2">
                      <FormLabel>Team Logo (Optional)</FormLabel>
                      {logoPreview ? (
                        <div className="flex items-center gap-4 p-3 rounded-lg border border-border bg-muted/30">
                          <Avatar className="h-16 w-16 rounded-lg border border-border">
                            <AvatarImage src={logoPreview} className="object-cover" />
                            <AvatarFallback className="rounded-lg text-xs">Logo</AvatarFallback>
                          </Avatar>
                          <div className="flex-1">
                            <p className="text-sm font-medium">Logo selected</p>
                            <p className="text-xs text-muted-foreground">Looks good!</p>
                          </div>
                          <Button type="button" variant="ghost" size="icon" onClick={clearLogo}>
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="w-full flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border hover:border-primary/50 bg-muted/20 hover:bg-muted/40 transition-colors py-8 cursor-pointer"
                        >
                          <Upload className="h-8 w-8 text-muted-foreground" />
                          <span className="text-sm text-muted-foreground">Click to upload logo</span>
                          <span className="text-xs text-muted-foreground">PNG, JPG, WebP up to 5MB</span>
                        </button>
                      )}
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleLogoChange}
                      />
                      {logoError && <p className="text-sm text-destructive">{logoError}</p>}
                    </div>

                    <DialogFooter>
                      <Button type="submit">Register Team</Button>
                    </DialogFooter>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
          )}

          {userHasTeam && (
            <Dialog open={isScheduleMatchOpen} onOpenChange={setIsScheduleMatchOpen}>
              <DialogTrigger asChild>
                <Button variant="secondary" className="gap-2">
                  <PlusCircle className="h-4 w-4" />
                  Schedule Match
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Schedule a Match</DialogTitle>
                  <DialogDescription>Arrange a match against another team.</DialogDescription>
                </DialogHeader>
                <Form {...matchForm}>
                  <form onSubmit={matchForm.handleSubmit(onScheduleMatch)} className="space-y-4 pt-4">
                    <FormField
                      control={matchForm.control}
                      name="awayTeamId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Opponent</FormLabel>
                          <FormControl>
                            <select
                              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                              {...field}
                            >
                              <option value="">Select a team...</option>
                              {teams.filter(t => t.ownerUid !== user?.uid).map(t => (
                                <option key={t.id} value={t.id}>{t.name}</option>
                              ))}
                            </select>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={matchForm.control}
                      name="scheduledDate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Date & Time</FormLabel>
                          <FormControl>
                            <Input type="datetime-local" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <DialogFooter>
                      <Button type="submit">Schedule</Button>
                    </DialogFooter>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      <Tabs defaultValue="standings" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="standings" className="gap-2"><Trophy className="h-4 w-4" /> Standings</TabsTrigger>
          <TabsTrigger value="fixtures" className="gap-2"><Calendar className="h-4 w-4" /> Fixtures</TabsTrigger>
          <TabsTrigger value="results" className="gap-2"><CheckCircle2 className="h-4 w-4" /> Results</TabsTrigger>
          <TabsTrigger value="teams" className="gap-2"><Shield className="h-4 w-4" /> Teams</TabsTrigger>
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
                    <div className="px-4 text-xs text-muted-foreground flex flex-col items-center">
                      <div className="px-2 py-1 bg-accent rounded font-mono">VS</div>
                      <div className="mt-2 whitespace-nowrap">{format(new Date(match.scheduledDate), "MMM d, HH:mm")}</div>
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

        <TabsContent value="teams" className="space-y-4">
          {teams.length === 0 ? (
            <Card className="border-dashed bg-muted/20">
              <CardContent className="p-8 text-center text-muted-foreground">No teams registered yet.</CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
              {teams.map(team => (
                <Card key={team.id} className="bg-card/50 border-border/50">
                  <CardContent className="flex flex-col items-center gap-3 p-6">
                    <Avatar className="h-20 w-20 rounded-xl border-2 border-border">
                      <AvatarImage src={team.logoURL ?? undefined} className="object-cover" />
                      <AvatarFallback className="rounded-xl text-xl font-bold">
                        {team.name.substring(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <span className="font-semibold text-center leading-tight">{team.name}</span>
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
