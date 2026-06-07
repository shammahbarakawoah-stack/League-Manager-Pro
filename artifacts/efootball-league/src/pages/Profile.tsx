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
  const { userData } = useAuth();
  const { toast } = useToast();
  const [teams, setTeams] = useState<Team[]>([]);
  const [stats, setStats] = useState({ matches: 0, wins: 0, goals: 0 });
  const [loading, setLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);

  const form = useForm<z.infer<typeof profileSchema>>({
    resolver: zodResolver(profileSchema),
    defaultValues: { displayName: userData?.displayName || "" },
  });

  useEffect(() => {
    if (!userData) return;

    form.reset({ displayName: userData.displayName });

    const fetchData = async () => {
      try {
        const teamsQ = query(collection(db, "teams"), where("ownerUid", "==", userData.uid));
        const teamsSnap = await getDocs(teamsQ);
        const fetchedTeams = teamsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Team));
        setTeams(fetchedTeams);

        if (fetchedTeams.length > 0) {
          let totalMatches = 0;
          let totalWins = 0;
          let totalGoals = 0;

          for (const team of fetchedTeams) {
            // Need to query matches where team is home OR away. Firestore doesn't support OR well directly here,
            // so we do two queries.
            const homeQ = query(collection(db, "matches"), where("homeTeamId", "==", team.id), where("status", "==", "approved"));
            const awayQ = query(collection(db, "matches"), where("awayTeamId", "==", team.id), where("status", "==", "approved"));
            
            const [homeSnap, awaySnap] = await Promise.all([getDocs(homeQ), getDocs(awayQ)]);
            
            homeSnap.docs.forEach(doc => {
              const m = doc.data() as Match;
              totalMatches++;
              totalGoals += (m.homeScore || 0);
              if (m.homeScore! > m.awayScore!) totalWins++;
            });

            awaySnap.docs.forEach(doc => {
              const m = doc.data() as Match;
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
  }, [userData, form]);

  const onSubmit = async (values: z.infer<typeof profileSchema>) => {
    if (!userData) return;
    try {
      setIsUpdating(true);
      await updateDoc(doc(db, "users", userData.uid), {
        displayName: values.displayName
      });
      toast({ title: "Profile updated successfully" });
    } catch (error: any) {
      toast({ title: "Error updating profile", description: error.message, variant: "destructive" });
    } finally {
      setIsUpdating(false);
    }
  };

  if (!userData) return null;

  if (loading) {
    return (
      <div className="container mx-auto p-4 md:p-8 space-y-6">
        <Skeleton className="h-48 w-full max-w-2xl" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 md:p-8 max-w-4xl space-y-6">
      <div className="flex items-center gap-6 mb-8">
        <Avatar className="h-24 w-24 border-4 border-background shadow-lg">
          <AvatarImage src={userData.photoURL} />
          <AvatarFallback className="text-3xl">{userData.displayName.substring(0, 2).toUpperCase()}</AvatarFallback>
        </Avatar>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{userData.displayName}</h1>
          <p className="text-muted-foreground">{userData.email}</p>
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
