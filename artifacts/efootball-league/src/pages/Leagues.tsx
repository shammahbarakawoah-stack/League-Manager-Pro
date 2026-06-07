import { useState, useEffect } from "react";
import { Link } from "wouter";
import { db } from "@/lib/firebase";
import { collection, query, onSnapshot, addDoc, updateDoc, doc, arrayUnion, where, getDocs } from "firebase/firestore";
import { useAuth } from "@/contexts/AuthContext";
import { League } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useToast } from "@/hooks/use-toast";
import { Trophy, Users, ShieldPlus, KeyRound } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

const leagueSchema = z.object({
  name: z.string().min(3).max(50),
  description: z.string().max(200),
});

function generateJoinCode(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

export default function Leagues() {
  const { user } = useAuth();
  const [leagues, setLeagues] = useState<League[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isJoinOpen, setIsJoinOpen] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const [joinLoading, setJoinLoading] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createDesc, setCreateDesc] = useState("");
  const [createLoading, setCreateLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    const q = query(collection(db, "leagues"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setLeagues(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as League)));
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  async function handleCreateLeague() {
    if (!user) return;
    const name = createName.trim();
    if (name.length < 3) {
      toast({ title: "League name must be at least 3 characters", variant: "destructive" });
      return;
    }
    setCreateLoading(true);
    try {
      await addDoc(collection(db, "leagues"), {
        name,
        description: createDesc.trim(),
        adminUid: user.uid,
        createdAt: Date.now(),
        status: "active",
        memberUids: [user.uid],
        joinCode: generateJoinCode(),
      });
      setIsCreateOpen(false);
      setCreateName("");
      setCreateDesc("");
      toast({ title: "League created successfully" });
    } catch (error: any) {
      toast({ title: "Error creating league", description: error.message, variant: "destructive" });
    } finally {
      setCreateLoading(false);
    }
  }

  async function handleJoinByCode() {
    if (!user) return;
    const code = joinCode.trim().toUpperCase();
    if (!code) return;
    setJoinLoading(true);
    try {
      const snap = await getDocs(
        query(collection(db, "leagues"), where("joinCode", "==", code))
      );
      if (snap.empty) {
        toast({ title: "Invalid code", description: "No league found with that code.", variant: "destructive" });
        return;
      }
      const leagueDoc = snap.docs[0];
      const leagueData = { id: leagueDoc.id, ...leagueDoc.data() } as League;
      if (leagueData.memberUids?.includes(user.uid)) {
        toast({ title: "Already a member", description: "You are already in this league." });
        setIsJoinOpen(false);
        return;
      }
      await updateDoc(doc(db, "leagues", leagueDoc.id), {
        memberUids: arrayUnion(user.uid)
      });
      setIsJoinOpen(false);
      setJoinCode("");
      toast({ title: `Joined "${leagueData.name}" successfully!` });
    } catch (error: any) {
      toast({ title: "Error joining league", description: error.message, variant: "destructive" });
    } finally {
      setJoinLoading(false);
    }
  }

  return (
    <div className="container mx-auto p-4 md:p-8 space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Leagues</h1>
          <p className="text-muted-foreground mt-1">Create a league or join one with a code.</p>
        </div>

        <div className="flex gap-2">
          {/* Join with code */}
          <Dialog open={isJoinOpen} onOpenChange={(open) => { setIsJoinOpen(open); if (!open) setJoinCode(""); }}>
            <DialogTrigger asChild>
              <Button variant="outline" className="gap-2">
                <KeyRound className="h-4 w-4" />
                Join with Code
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[380px]">
              <DialogHeader>
                <DialogTitle>Join a League</DialogTitle>
                <DialogDescription>
                  Enter the 6-character code shared by the league admin.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <div className="space-y-2">
                  <Label htmlFor="join-code">League Code</Label>
                  <Input
                    id="join-code"
                    placeholder="e.g. AB12CD"
                    value={joinCode}
                    onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                    maxLength={6}
                    className="text-center text-xl font-mono tracking-widest uppercase"
                    onKeyDown={(e) => e.key === "Enter" && handleJoinByCode()}
                  />
                </div>
              </div>
              <DialogFooter className="pt-2">
                <Button onClick={handleJoinByCode} disabled={joinLoading || joinCode.length < 6} className="w-full">
                  {joinLoading ? "Joining..." : "Join League"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Create league */}
          <Dialog open={isCreateOpen} onOpenChange={(open) => { setIsCreateOpen(open); if (!open) { setCreateName(""); setCreateDesc(""); } }}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <ShieldPlus className="h-4 w-4" />
                Create League
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>Create New League</DialogTitle>
                <DialogDescription>
                  A unique join code will be generated. Share it with players to invite them.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label htmlFor="league-name">League Name</Label>
                  <Input
                    id="league-name"
                    placeholder="e.g. Premier Elite S1"
                    value={createName}
                    onChange={(e) => setCreateName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="league-desc">Description (Optional)</Label>
                  <Input
                    id="league-desc"
                    placeholder="Brief rules or description..."
                    value={createDesc}
                    onChange={(e) => setCreateDesc(e.target.value)}
                  />
                </div>
              </div>
              <DialogFooter className="pt-2">
                <Button onClick={handleCreateLeague} disabled={createLoading} className="w-full">
                  {createLoading ? "Creating..." : "Create League"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {loading ? (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-48" />)}
        </div>
      ) : leagues.length === 0 ? (
        <Card className="border-dashed bg-muted/20">
          <CardContent className="flex flex-col items-center justify-center p-12 text-center">
            <Trophy className="h-12 w-12 text-muted-foreground mb-4 opacity-50" />
            <h3 className="text-lg font-semibold">No Leagues Found</h3>
            <p className="text-sm text-muted-foreground mt-2 max-w-md">
              Create a league to get started, or ask a league admin for their join code.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {leagues.map(league => {
            const isMember = user && league.memberUids?.includes(user.uid);
            const isAdmin = user && league.adminUid === user.uid;

            return (
              <Card key={league.id} className="bg-card/50 border-border/50 hover:border-primary/50 transition-colors flex flex-col">
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <CardTitle className="line-clamp-1" title={league.name}>{league.name}</CardTitle>
                    <Badge variant={league.status === "active" ? "default" : "secondary"}>
                      {league.status}
                    </Badge>
                  </div>
                  <CardDescription className="line-clamp-2 min-h-[40px]">
                    {league.description || "No description provided."}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex-1 space-y-2">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Users className="h-4 w-4" />
                    <span>{league.memberUids?.length || 0} Managers</span>
                  </div>
                  {isAdmin && league.joinCode && (
                    <div className="flex items-center gap-2 text-sm">
                      <KeyRound className="h-4 w-4 text-primary" />
                      <span className="text-muted-foreground">Code:</span>
                      <span className="font-mono font-bold text-primary tracking-widest">{league.joinCode}</span>
                    </div>
                  )}
                </CardContent>
                <CardFooter className="border-t border-border/50 pt-4">
                  {isMember ? (
                    <Link href={`/leagues/${league.id}`} className="w-full">
                      <Button variant="secondary" className="w-full">View League</Button>
                    </Link>
                  ) : (
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={() => { setJoinCode(""); setIsJoinOpen(true); }}
                    >
                      <KeyRound className="h-4 w-4 mr-2" />
                      Join with Code
                    </Button>
                  )}
                </CardFooter>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
