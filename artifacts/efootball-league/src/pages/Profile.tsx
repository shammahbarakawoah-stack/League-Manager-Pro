import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/lib/firebase";
import { collection, query, where, getDocs, doc, updateDoc } from "firebase/firestore";
import { Team, Match } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useToast } from "@/hooks/use-toast";
import { User, Shield, Activity, Save } from "lucide-react";

const profileSchema = z.object({
  displayName: z.string().min(2).max(50),
});

export default function Profile() {
  const { user, userData } = useAuth();
  const { toast } = useToast();
  const [teams, setTeams] = useState<Team[]>([]);
  const [stats, setStats] = useState({ matches: 0, wins: 0, goals: 0 });
  const [loading, setLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);

  const displayName = userData?.displayName || user?.displayName || "";

  const form = useForm<z.infer<typeof profileSchema>>({
    resolver: zodResolver(profileSchema),
    defaultValues: { displayName },
  });

  // Reset form when displayName becomes available
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
          // Fetch home and away matches for all teams in parallel
          const matchPairs = await Promise.all(
            fetchedTeams.map(team =>
              Promise.all([
                getDocs(query(collection(db, "matches"), where("homeTeamId", "==", team.id), where("status", "==", "approved"))),
                getDocs(query(collection(db, "matches"), where("awayTeamId", "==", team.id), where("status", "==", "approved"))),
              ])
            )
          );

          let totalMatches = 0, totalWins = 0, totalGoals = 0;

          for (const [homeSnap, awaySnap] of matchPairs) {
            homeSnap.docs.forEach(d => {
              const m = d.data() as Match;
              totalMatches++;
              totalGoals += (m.homeScore || 0);
              if (m.homeScore! > m.awayScore!) totalWins++;
            });
            awaySnap.docs.forEach(d => {
              const m = d.data() as Match;
              totalMatches++;
              totalGoals += (m.awayScore || 0);
              if (m.awayScore! > m.homeScore!) totalWins++;
            });
          }

          setStats({ matches: totalMatches, wins: totalWins, goals: totalGoals });
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
      await updateDoc(doc(db, "users", user.uid), {
        displayName: values.displayName
      });
      toast({ title: "Profile updated successfully" });
    } catch (error: any) {
      toast({ title: "Error updating profile", description: error.message, variant: "destructive" });
    } finally {
      setIsUpdating(false);
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto p-4 md:p-8 space-y-6">
        <Skeleton className="h-48 w-full max-w-2xl" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const initials = displayName.substring(0, 2).toUpperCase() || "??";

  return (
    <div className="container mx-auto p-4 md:p-8 max-w-4xl space-y-6">
      <div className="flex items-center gap-6 mb-8">
        <Avatar className="h-24 w-24 border-4 border-background shadow-lg">
          <AvatarImage src={userData?.photoURL} />
          <AvatarFallback className="text-3xl">{initials}</AvatarFallback>
        </Avatar>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{displayName || "Manager"}</h1>
          <p className="text-muted-foreground">{userData?.email || user?.email}</p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="bg-card/50 border-border/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5 text-primary" />
              Profile Settings
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="displayName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Display Name</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
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

        <Card className="bg-card/50 border-border/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-primary" />
              Career Stats
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-3 gap-4 text-center">
            <div className="space-y-1">
              <div className="text-3xl font-bold text-foreground">{stats.matches}</div>
              <div className="text-xs text-muted-foreground uppercase tracking-wider">Matches</div>
            </div>
            <div className="space-y-1">
              <div className="text-3xl font-bold text-primary">{stats.wins}</div>
              <div className="text-xs text-muted-foreground uppercase tracking-wider">Wins</div>
            </div>
            <div className="space-y-1">
              <div className="text-3xl font-bold text-foreground">{stats.goals}</div>
              <div className="text-xs text-muted-foreground uppercase tracking-wider">Goals</div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-card/50 border-border/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            My Teams
          </CardTitle>
          <CardDescription>Teams you manage across all leagues</CardDescription>
        </CardHeader>
        <CardContent>
          {teams.length === 0 ? (
            <p className="text-muted-foreground text-sm">You haven't registered any teams yet.</p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
              {teams.map(team => (
                <div key={team.id} className="flex items-center gap-3 p-3 rounded-lg border border-border/50 bg-background/50">
                  <Avatar className="h-10 w-10 border border-border rounded">
                    <AvatarImage src={team.logoURL} className="object-cover" />
                    <AvatarFallback className="rounded text-xs">{team.name.substring(0, 2).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <span className="font-semibold truncate">{team.name}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
