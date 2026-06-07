import { useState, useEffect } from "react";
import { Link } from "wouter";
import { db } from "@/lib/firebase";
import { collection, query, onSnapshot, addDoc, updateDoc, doc, arrayUnion } from "firebase/firestore";
import { useAuth } from "@/contexts/AuthContext";
import { League } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useToast } from "@/hooks/use-toast";
import { Trophy, Users, ShieldPlus } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

const leagueSchema = z.object({
  name: z.string().min(3).max(50),
  description: z.string().max(200),
});

export default function Leagues() {
  const { userData } = useAuth();
  const [leagues, setLeagues] = useState<League[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const { toast } = useToast();

  const form = useForm<z.infer<typeof leagueSchema>>({
    resolver: zodResolver(leagueSchema),
    defaultValues: { name: "", description: "" },
  });

  useEffect(() => {
    const q = query(collection(db, "leagues"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedLeagues = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as League));
      setLeagues(fetchedLeagues);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  async function onSubmit(values: z.infer<typeof leagueSchema>) {
    if (!userData) return;
    try {
      await addDoc(collection(db, "leagues"), {
        name: values.name,
        description: values.description,
        adminUid: userData.uid,
        createdAt: Date.now(),
        status: "active",
        memberUids: [userData.uid]
      });
      setIsCreateOpen(false);
      form.reset();
      toast({ title: "League created successfully" });
    } catch (error: any) {
      toast({ title: "Error creating league", description: error.message, variant: "destructive" });
    }
  }

  async function handleJoinLeague(leagueId: string) {
    if (!userData) return;
    try {
      const leagueRef = doc(db, "leagues", leagueId);
      await updateDoc(leagueRef, {
        memberUids: arrayUnion(userData.uid)
      });
      toast({ title: "Joined league successfully!" });
    } catch (error: any) {
      toast({ title: "Error joining league", description: error.message, variant: "destructive" });
    }
  }

  return (
    <div className="container mx-auto p-4 md:p-8 space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Leagues</h1>
          <p className="text-muted-foreground mt-1">Browse, join, or create competitions.</p>
        </div>
        
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
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
                Set up a new competition. You will be assigned as the administrator.
              </DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>League Name</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. Premier Elite S1" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description (Optional)</FormLabel>
                      <FormControl>
                        <Input placeholder="Brief rules or description..." {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <DialogFooter>
                  <Button type="submit">Create League</Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
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
              There are no active leagues at the moment. Be the first to create one!
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {leagues.map(league => {
            const isMember = userData && league.memberUids?.includes(userData.uid);
            
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
                <CardContent className="flex-1">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Users className="h-4 w-4" />
                    <span>{league.memberUids?.length || 0} Managers</span>
                  </div>
                </CardContent>
                <CardFooter className="flex justify-between border-t border-border/50 pt-4">
                  {isMember ? (
                    <Link href={`/leagues/${league.id}`}>
                      <Button variant="secondary" className="w-full">View League</Button>
                    </Link>
                  ) : (
                    <Button onClick={() => handleJoinLeague(league.id)} className="w-full">
                      Join League
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
