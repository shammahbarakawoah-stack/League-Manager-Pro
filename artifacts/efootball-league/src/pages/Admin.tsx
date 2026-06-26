import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/lib/firebase";
import {
  collection, query, where, onSnapshot, doc,
  updateDoc, deleteDoc, addDoc, arrayUnion
} from "firebase/firestore";
import { League, Match, Payment } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { Check, X, ShieldAlert, Trash2, MessageSquare, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { createNotification, createBulkNotifications } from "@/lib/notifications";
import {
  Dialog, DialogContent, DialogDescription,
  DialogFooter, DialogHeader, DialogTitle
} from "@/components/ui/dialog";

export default function Admin() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [leagues, setLeagues] = useState<League[]>([]);
  const [pendingMatches, setPendingMatches] = useState<Match[]>([]);
  const [disputedMatches, setDisputedMatches] = useState<Match[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);

  // Dispute resolution state
  const [resolveMatch, setResolveMatch] = useState<Match | null>(null);
  const [resolveHome, setResolveHome] = useState("0");
  const [resolveAway, setResolveAway] = useState("0");
  const [resolveNote, setResolveNote] = useState("");
  const [resolveLoading, setResolveLoading] = useState(false);

  // Announcement state
  const [announcementLeague, setAnnouncementLeague] = useState("");
  const [announcementText, setAnnouncementText] = useState("");
  const [announcementLoading, setAnnouncementLoading] = useState(false);

  // Payment note state
  const [paymentNote, setPaymentNote] = useState<Record<string, string>>({});

  useEffect(() => {
    const unsubLeagues = onSnapshot(query(collection(db, "leagues")), snap => {
      setLeagues(snap.docs.map(d => ({ id: d.id, ...d.data() } as League)));
    });
    const unsubPending = onSnapshot(
      query(collection(db, "matches"), where("status", "==", "pending_approval")),
      snap => setPendingMatches(snap.docs.map(d => ({ id: d.id, ...d.data() } as Match)))
    );
    const unsubDisputed = onSnapshot(
      query(collection(db, "matches"), where("status", "==", "disputed")),
      snap => setDisputedMatches(snap.docs.map(d => ({ id: d.id, ...d.data() } as Match)))
    );
    const unsubPayments = onSnapshot(query(collection(db, "payments")), snap => {
      setPayments(snap.docs.map(d => ({ id: d.id, ...d.data() } as Payment))
        .sort((a, b) => b.createdAt - a.createdAt));
      setLoading(false);
    });
    return () => { unsubLeagues(); unsubPending(); unsubDisputed(); unsubPayments(); };
  }, []);

  // ── Results ──────────────────────────────────────────────────────────────
  const handleApprove = async (match: Match) => {
    await updateDoc(doc(db, "matches", match.id), { status: "approved", updatedAt: Date.now() });
    // Notify both teams
    const homeTeam = match.homeSubmission?.uid;
    const awayTeam = match.awaySubmission?.uid;
    const targets = [homeTeam, awayTeam].filter(Boolean) as string[];
    if (targets.length) {
      await createBulkNotifications(targets,
        "Result Approved",
        `${match.homeTeamName} ${match.homeScore} - ${match.awayScore} ${match.awayTeamName}`,
        "match", { leagueId: match.leagueId, matchId: match.id }
      );
    }
    toast({ title: "Result approved" });
  };

  const handleReject = async (match: Match) => {
    await updateDoc(doc(db, "matches", match.id), {
      status: "scheduled", homeScore: null, awayScore: null,
      homeSubmission: null, awaySubmission: null, updatedAt: Date.now()
    });
    toast({ title: "Result rejected — match reset to scheduled" });
  };

  // ── Disputes ─────────────────────────────────────────────────────────────
  const handleResolveDispute = async () => {
    if (!resolveMatch) return;
    const hs = parseInt(resolveHome, 10);
    const as_ = parseInt(resolveAway, 10);
    if (isNaN(hs) || isNaN(as_)) { toast({ title: "Enter valid scores", variant: "destructive" }); return; }
    setResolveLoading(true);
    try {
      await updateDoc(doc(db, "matches", resolveMatch.id), {
        status: "approved", homeScore: hs, awayScore: as_,
        scorers: [], assists: [], resultNotes: resolveNote,
        updatedAt: Date.now()
      });
      // Notify both sides
      const targets = [resolveMatch.homeSubmission?.uid, resolveMatch.awaySubmission?.uid].filter(Boolean) as string[];
      await createBulkNotifications(targets,
        "Dispute Resolved",
        `Admin set result: ${resolveMatch.homeTeamName} ${hs} - ${as_} ${resolveMatch.awayTeamName}. ${resolveNote}`,
        "dispute", { leagueId: resolveMatch.leagueId, matchId: resolveMatch.id }
      );
      toast({ title: "Dispute resolved" });
      setResolveMatch(null); setResolveNote(""); setResolveHome("0"); setResolveAway("0");
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setResolveLoading(false);
    }
  };

  // ── Payments ─────────────────────────────────────────────────────────────
  const handlePaymentAction = async (
    payment: Payment,
    action: "approved" | "rejected" | "resubmit"
  ) => {
    const note = paymentNote[payment.id] ?? "";
    await updateDoc(doc(db, "payments", payment.id), {
      status: action, adminNote: note, updatedAt: Date.now()
    });

    if (action === "approved") {
      // Add user to league memberUids
      await updateDoc(doc(db, "leagues", payment.leagueId), {
        memberUids: arrayUnion(payment.uid)
      });
      await createNotification(payment.uid,
        "Payment Approved — Welcome!",
        `Your payment of KES ${payment.amount} for ${payment.leagueName ?? "the league"} has been approved. You can now register a team.`,
        "payment_approved", { leagueId: payment.leagueId, paymentId: payment.id }
      );
    } else if (action === "rejected") {
      await createNotification(payment.uid,
        "Payment Rejected",
        `Your payment was rejected. ${note ? `Reason: ${note}` : "Contact the admin for details."}`,
        "payment_rejected", { leagueId: payment.leagueId, paymentId: payment.id }
      );
    } else {
      await createNotification(payment.uid,
        "Resubmit Payment",
        `Please resubmit your payment details. ${note ? `Note: ${note}` : ""}`,
        "payment_pending", { leagueId: payment.leagueId, paymentId: payment.id }
      );
    }

    setPaymentNote(prev => { const next = { ...prev }; delete next[payment.id]; return next; });
    toast({ title: `Payment ${action}` });
  };

  // ── Leagues ───────────────────────────────────────────────────────────────
  const handleToggleStatus = async (league: League) => {
    await updateDoc(doc(db, "leagues", league.id), {
      status: league.status === "active" ? "completed" : "active"
    });
    toast({ title: `League marked as ${league.status === "active" ? "completed" : "active"}` });
  };

  const handleDeleteLeague = async (leagueId: string) => {
    if (!confirm("Delete this league? Cannot be undone.")) return;
    await deleteDoc(doc(db, "leagues", leagueId));
    toast({ title: "League deleted" });
  };

  const handleTogglePayment = async (league: League) => {
    await updateDoc(doc(db, "leagues", league.id), {
      requiresPayment: !league.requiresPayment
    });
    toast({ title: `Payment requirement ${!league.requiresPayment ? "enabled" : "disabled"}` });
  };

  // ── Announcements ─────────────────────────────────────────────────────────
  const handleAnnouncement = async () => {
    if (!announcementLeague || !announcementText.trim()) return;
    const league = leagues.find(l => l.id === announcementLeague);
    if (!league) return;
    setAnnouncementLoading(true);
    try {
      await createBulkNotifications(
        league.memberUids,
        `Announcement: ${league.name}`,
        announcementText.trim(),
        "announcement",
        { leagueId: league.id }
      );
      setAnnouncementText("");
      toast({ title: `Announcement sent to ${league.memberUids.length} members` });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setAnnouncementLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto p-4 md:p-8 space-y-6">
        <Skeleton className="h-10 w-48" /><Skeleton className="h-[400px] w-full" />
      </div>
    );
  }

  const pendingPayments = payments.filter(p => p.status === "pending");
  const allOtherPayments = payments.filter(p => p.status !== "pending");

  return (
    <div className="container mx-auto p-4 md:p-8 space-y-6">
      <div className="flex items-center gap-3 mb-6">
        <ShieldAlert className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Admin Control Panel</h1>
          <p className="text-muted-foreground mt-1">Manage payments, results, disputes, and leagues.</p>
        </div>
      </div>

      <Tabs defaultValue="payments" className="w-full">
        <TabsList className="mb-4 flex-wrap h-auto gap-1">
          <TabsTrigger value="payments">
            Payments {pendingPayments.length > 0 && <Badge className="ml-1 text-xs py-0 px-1">{pendingPayments.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="results">
            Results {pendingMatches.length > 0 && <Badge className="ml-1 text-xs py-0 px-1">{pendingMatches.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="disputes">
            Disputes {disputedMatches.length > 0 && <Badge variant="destructive" className="ml-1 text-xs py-0 px-1">{disputedMatches.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="leagues">Leagues</TabsTrigger>
          <TabsTrigger value="announce">Announce</TabsTrigger>
        </TabsList>

        {/* Payments */}
        <TabsContent value="payments" className="space-y-6">
          {pendingPayments.length === 0 && allOtherPayments.length === 0 ? (
            <Card className="border-dashed bg-muted/20"><CardContent className="p-12 text-center text-muted-foreground">No payments submitted yet.</CardContent></Card>
          ) : (
            <>
              {pendingPayments.length > 0 && (
                <div className="space-y-3">
                  <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">Pending Review</h3>
                  {pendingPayments.map(p => {
                    const league = leagues.find(l => l.id === p.leagueId);
                    return (
                      <Card key={p.id} className="bg-card/50 border-l-4 border-l-yellow-500">
                        <CardContent className="p-4 space-y-3">
                          <div className="flex items-start justify-between flex-wrap gap-2">
                            <div>
                              <p className="font-semibold">{p.displayName}</p>
                              <p className="text-xs text-primary">{league?.name ?? p.leagueName}</p>
                              <p className="text-xs text-muted-foreground">{format(new Date(p.createdAt), "MMM d, HH:mm")}</p>
                            </div>
                            <Badge variant="outline" className="border-yellow-500 text-yellow-400">Pending</Badge>
                          </div>
                          <div className="grid grid-cols-3 gap-2 text-sm bg-muted/30 rounded p-3">
                            <div><p className="text-xs text-muted-foreground">Code</p><p className="font-mono font-bold">{p.transactionCode}</p></div>
                            <div><p className="text-xs text-muted-foreground">Phone</p><p className="font-medium">{p.phoneNumber}</p></div>
                            <div><p className="text-xs text-muted-foreground">Amount</p><p className="font-bold text-primary">KES {p.amount}</p></div>
                          </div>
                          <div className="space-y-2">
                            <Label className="text-xs">Admin Note (optional)</Label>
                            <Input
                              placeholder="Reason for rejection or resubmission..."
                              value={paymentNote[p.id] ?? ""}
                              onChange={e => setPaymentNote(prev => ({ ...prev, [p.id]: e.target.value }))}
                            />
                          </div>
                          <div className="flex gap-2">
                            <Button size="sm" className="flex-1" onClick={() => handlePaymentAction(p, "approved")}>
                              <Check className="h-3.5 w-3.5 mr-1" />Approve
                            </Button>
                            <Button size="sm" variant="outline" className="flex-1 border-orange-500/50 text-orange-400 hover:bg-orange-500/10"
                              onClick={() => handlePaymentAction(p, "resubmit")}>
                              <RefreshCw className="h-3.5 w-3.5 mr-1" />Resubmit
                            </Button>
                            <Button size="sm" variant="outline" className="flex-1 border-destructive/50 text-destructive hover:bg-destructive/10"
                              onClick={() => handlePaymentAction(p, "rejected")}>
                              <X className="h-3.5 w-3.5 mr-1" />Reject
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
              {allOtherPayments.length > 0 && (
                <div className="space-y-2">
                  <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">History</h3>
                  {allOtherPayments.map(p => (
                    <Card key={p.id} className="bg-card/30">
                      <CardContent className="p-3 flex items-center justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">{p.displayName}</p>
                          <p className="text-xs text-muted-foreground">KES {p.amount} · Code: {p.transactionCode}</p>
                        </div>
                        <Badge variant={p.status === "approved" ? "default" : p.status === "rejected" ? "destructive" : "outline"}>
                          {p.status}
                        </Badge>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </>
          )}
        </TabsContent>

        {/* Results */}
        <TabsContent value="results" className="space-y-3">
          {pendingMatches.length === 0 ? (
            <Card className="border-dashed bg-muted/20"><CardContent className="p-12 text-center text-muted-foreground">No pending results.</CardContent></Card>
          ) : (
            pendingMatches.map(match => {
              const league = leagues.find(l => l.id === match.leagueId);
              return (
                <Card key={match.id} className="bg-card/50">
                  <CardContent className="p-4 flex flex-col md:flex-row items-center justify-between gap-4">
                    <div className="flex-1">
                      <div className="text-xs text-primary font-medium mb-1">{league?.name}</div>
                      <div className="text-xs text-muted-foreground mb-2">Submitted {format(new Date(match.updatedAt), "MMM d, HH:mm")}</div>
                      <div className="flex items-center gap-4">
                        <span className="font-semibold">{match.homeTeamName}</span>
                        <span className="px-3 py-1 font-mono font-bold bg-background border border-border rounded">{match.homeScore} - {match.awayScore}</span>
                        <span className="font-semibold">{match.awayTeamName}</span>
                      </div>
                      {(match.scorers?.length ?? 0) > 0 && <p className="text-xs text-muted-foreground mt-1">Goals: {match.scorers!.join(", ")}</p>}
                    </div>
                    <div className="flex gap-2 w-full md:w-auto">
                      <Button variant="outline" size="sm" className="flex-1 md:flex-none border-destructive text-destructive hover:bg-destructive/10" onClick={() => handleReject(match)}>
                        <X className="h-4 w-4 mr-1" />Reject
                      </Button>
                      <Button size="sm" className="flex-1 md:flex-none" onClick={() => handleApprove(match)}>
                        <Check className="h-4 w-4 mr-1" />Approve
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </TabsContent>

        {/* Disputes */}
        <TabsContent value="disputes" className="space-y-3">
          {disputedMatches.length === 0 ? (
            <Card className="border-dashed bg-muted/20"><CardContent className="p-12 text-center text-muted-foreground">No disputes to resolve.</CardContent></Card>
          ) : (
            disputedMatches.map(match => {
              const league = leagues.find(l => l.id === match.leagueId);
              return (
                <Card key={match.id} className="bg-card/50 border-l-4 border-l-orange-500">
                  <CardContent className="p-4 space-y-3">
                    <div className="text-xs text-primary font-medium">{league?.name}</div>
                    <div className="font-semibold">{match.homeTeamName} vs {match.awayTeamName}</div>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div className="bg-muted/30 rounded p-3">
                        <p className="text-xs text-muted-foreground mb-1">Home Submission</p>
                        <p className="font-mono font-bold text-lg">{match.homeSubmission?.homeScore ?? "—"} - {match.homeSubmission?.awayScore ?? "—"}</p>
                      </div>
                      <div className="bg-muted/30 rounded p-3">
                        <p className="text-xs text-muted-foreground mb-1">Away Submission</p>
                        <p className="font-mono font-bold text-lg">{match.awaySubmission?.homeScore ?? "—"} - {match.awaySubmission?.awayScore ?? "—"}</p>
                      </div>
                    </div>
                    <Button size="sm" variant="outline" className="w-full border-orange-500/50 text-orange-400 hover:bg-orange-500/10"
                      onClick={() => { setResolveMatch(match); setResolveHome("0"); setResolveAway("0"); setResolveNote(""); }}>
                      Resolve Dispute
                    </Button>
                  </CardContent>
                </Card>
              );
            })
          )}
        </TabsContent>

        {/* Leagues */}
        <TabsContent value="leagues" className="space-y-3">
          {leagues.filter(l => (l.memberUids?.length ?? 0) > 0).map(league => (
            <Card key={league.id} className="bg-card/50">
              <CardContent className="p-4 flex flex-col md:flex-row items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-bold">{league.name}</h3>
                    <Badge variant={league.status === "active" ? "default" : "secondary"}>{league.status}</Badge>
                    {league.requiresPayment && <Badge variant="outline" className="border-yellow-500/50 text-yellow-400">Paid</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{league.memberUids?.length ?? 0} members · Code: {league.joinCode}</p>
                </div>
                <div className="flex gap-2 flex-wrap justify-end">
                  <Button variant="outline" size="sm" onClick={() => handleTogglePayment(league)}>
                    {league.requiresPayment ? "Disable" : "Enable"} Payment
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => handleToggleStatus(league)}>
                    Mark {league.status === "active" ? "Completed" : "Active"}
                  </Button>
                  <Button variant="destructive" size="sm" onClick={() => handleDeleteLeague(league.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        {/* Announcements */}
        <TabsContent value="announce">
          <Card className="bg-card/50">
            <CardHeader><CardTitle className="flex items-center gap-2 text-base"><MessageSquare className="h-4 w-4 text-primary" />Send Announcement</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Select League</Label>
                <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={announcementLeague} onChange={e => setAnnouncementLeague(e.target.value)}>
                  <option value="">Choose a league...</option>
                  {leagues.filter(l => l.memberUids?.length > 0).map(l => (
                    <option key={l.id} value={l.id}>{l.name} ({l.memberUids?.length ?? 0} members)</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label>Message</Label>
                <Textarea
                  placeholder="Type your announcement here..."
                  value={announcementText}
                  onChange={e => setAnnouncementText(e.target.value)}
                  rows={4}
                />
              </div>
              <Button onClick={handleAnnouncement} disabled={!announcementLeague || !announcementText.trim() || announcementLoading} className="w-full">
                {announcementLoading ? "Sending..." : "Send to All Members"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Dispute resolution dialog */}
      <Dialog open={!!resolveMatch} onOpenChange={open => !open && setResolveMatch(null)}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Resolve Dispute</DialogTitle>
            <DialogDescription>{resolveMatch?.homeTeamName} vs {resolveMatch?.awayTeamName}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="flex items-center gap-3">
              <div className="flex-1 space-y-1">
                <Label className="text-xs">{resolveMatch?.homeTeamName}</Label>
                <Input type="number" min="0" value={resolveHome} onChange={e => setResolveHome(e.target.value)} className="text-center font-mono text-xl h-12" />
              </div>
              <span className="mt-5 text-muted-foreground font-bold">-</span>
              <div className="flex-1 space-y-1">
                <Label className="text-xs">{resolveMatch?.awayTeamName}</Label>
                <Input type="number" min="0" value={resolveAway} onChange={e => setResolveAway(e.target.value)} className="text-center font-mono text-xl h-12" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Resolution Note (sent to both players)</Label>
              <Textarea placeholder="Explain the decision..." value={resolveNote} onChange={e => setResolveNote(e.target.value)} rows={2} />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setResolveMatch(null)}>Cancel</Button>
            <Button onClick={handleResolveDispute} disabled={resolveLoading}>{resolveLoading ? "Saving..." : "Set Official Result"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
