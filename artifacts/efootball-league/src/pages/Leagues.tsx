import { useState, useEffect } from "react";
import { Link } from "wouter";
import { db } from "@/lib/firebase";
import {
  collection, query, onSnapshot, addDoc, updateDoc,
  doc, arrayUnion, where, getDocs
} from "firebase/firestore";
import { useAuth } from "@/contexts/AuthContext";
import { League, Payment } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogDescription,
  DialogFooter, DialogHeader, DialogTitle, DialogTrigger
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  Trophy, Users, ShieldPlus, KeyRound, Copy, Share2,
  Lock, Calendar, AlertCircle, CheckCircle2
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { createNotification } from "@/lib/notifications";

function generateJoinCode(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

export default function Leagues() {
  const { user, userData } = useAuth();
  const [leagues, setLeagues] = useState<League[]>([]);
  const [myPayments, setMyPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);

  // Join flow
  const [isJoinOpen, setIsJoinOpen] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const [joinLoading, setJoinLoading] = useState(false);
  const [pendingLeague, setPendingLeague] = useState<League | null>(null); // league needing payment

  // M-Pesa payment form
  const [txCode, setTxCode] = useState("");
  const [txPhone, setTxPhone] = useState("");
  const [txAmount, setTxAmount] = useState("");
  const [paymentLoading, setPaymentLoading] = useState(false);

  // Create league
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createDesc, setCreateDesc] = useState("");
  const [createMax, setCreateMax] = useState("");
  const [createDeadline, setCreateDeadline] = useState("");
  const [createFee, setCreateFee] = useState("");
  const [createRequiresPayment, setCreateRequiresPayment] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);

  const { toast } = useToast();

  useEffect(() => {
    const unsub = onSnapshot(query(collection(db, "leagues")), snap => {
      setLeagues(snap.docs.map(d => ({ id: d.id, ...d.data() } as League)));
      setLoading(false);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(
      query(collection(db, "payments"), where("uid", "==", user.uid)),
      snap => setMyPayments(snap.docs.map(d => ({ id: d.id, ...d.data() } as Payment)))
    );
    return () => unsub();
  }, [user]);

  const copyCode = async (code: string) => {
    try { await navigator.clipboard.writeText(code); toast({ title: "Code copied to clipboard" }); }
    catch { toast({ title: "Copy failed — code: " + code }); }
  };

  const shareCode = async (league: League) => {
    const text = `Join "${league.name}" on eFootball League! Code: ${league.joinCode}`;
    if (navigator.share) {
      try { await navigator.share({ title: league.name, text }); }
      catch { /* user cancelled */ }
    } else {
      await copyCode(league.joinCode);
    }
  };

  // Step 1: validate code
  const handleJoinByCode = async () => {
    if (!user) return;
    const code = joinCode.trim().toUpperCase();
    if (!code) return;
    setJoinLoading(true);
    try {
      const snap = await getDocs(query(collection(db, "leagues"), where("joinCode", "==", code)));
      if (snap.empty) {
        toast({ title: "Invalid code", description: "No league found with that code.", variant: "destructive" });
        return;
      }
      const leagueDoc = snap.docs[0];
      const leagueData = { id: leagueDoc.id, ...leagueDoc.data() } as League;

      // Already a member?
      if (leagueData.memberUids?.includes(user.uid)) {
        toast({ title: "Already a member" });
        setIsJoinOpen(false); return;
      }

      // Registration closed?
      if (leagueData.status !== "active") {
        toast({ title: "Registration closed", description: "This league is no longer accepting members.", variant: "destructive" }); return;
      }

      // Deadline passed?
      if (leagueData.registrationDeadline && leagueData.registrationDeadline < Date.now()) {
        toast({ title: "Deadline passed", description: "Registration for this league has closed.", variant: "destructive" }); return;
      }

      // Max members?
      if (leagueData.maxMembers && (leagueData.memberUids?.length ?? 0) >= leagueData.maxMembers) {
        toast({ title: "League full", description: "All slots are taken.", variant: "destructive" }); return;
      }

      // Payment gate?
      if (leagueData.requiresPayment) {
        // Check if already submitted a payment
        const existingPayment = myPayments.find(p => p.leagueId === leagueData.id);
        if (existingPayment) {
          toast({
            title: `Payment ${existingPayment.status}`,
            description: existingPayment.status === "pending"
              ? "Your payment is under review. Wait for admin approval."
              : existingPayment.status === "approved"
              ? "Already approved — contact admin if you can't access the league."
              : "Payment was rejected or requires resubmission.",
          });
          setIsJoinOpen(false); return;
        }
        // Show payment dialog
        setPendingLeague(leagueData);
        setIsJoinOpen(false);
        setTxCode(""); setTxPhone(""); setTxAmount(String(leagueData.entryFee ?? ""));
        return;
      }

      // No payment required — join directly
      await updateDoc(doc(db, "leagues", leagueDoc.id), { memberUids: arrayUnion(user.uid) });
      setIsJoinOpen(false); setJoinCode("");
      toast({ title: `Joined "${leagueData.name}" successfully!` });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setJoinLoading(false);
    }
  };

  // Step 2: submit M-Pesa payment
  const handleSubmitPayment = async () => {
    if (!pendingLeague || !user) return;
    if (!txCode.trim() || !txPhone.trim() || !txAmount.trim()) {
      toast({ title: "Fill in all payment fields", variant: "destructive" }); return;
    }
    setPaymentLoading(true);
    try {
      // Find league admin for notification
      const payment: Omit<Payment, "id"> = {
        leagueId: pendingLeague.id,
        leagueName: pendingLeague.name,
        uid: user.uid,
        displayName: userData?.displayName || user.displayName || user.email || "Player",
        transactionCode: txCode.trim().toUpperCase(),
        phoneNumber: txPhone.trim(),
        amount: parseFloat(txAmount) || 0,
        status: "pending",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      await addDoc(collection(db, "payments"), payment);
      // Notify league admin
      await createNotification(
        pendingLeague.adminUid,
        "New Payment Submitted",
        `${payment.displayName} submitted a payment for "${pendingLeague.name}". TX: ${payment.transactionCode}`,
        "payment_pending", { leagueId: pendingLeague.id }
      );
      toast({ title: "Payment submitted for review", description: "Admin will verify and approve your payment." });
      setPendingLeague(null); setJoinCode("");
    } catch (error: any) {
      toast({ title: "Error submitting payment", description: error.message, variant: "destructive" });
    } finally {
      setPaymentLoading(false);
    }
  };

  const handleCreateLeague = async () => {
    if (!user) return;
    const name = createName.trim();
    if (name.length < 3) { toast({ title: "League name must be at least 3 characters", variant: "destructive" }); return; }
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
        ...(createMax ? { maxMembers: parseInt(createMax, 10) } : {}),
        ...(createDeadline ? { registrationDeadline: new Date(createDeadline).getTime() } : {}),
        ...(createRequiresPayment ? { requiresPayment: true, entryFee: parseFloat(createFee) || 0 } : {}),
      });
      setIsCreateOpen(false);
      setCreateName(""); setCreateDesc(""); setCreateMax(""); setCreateDeadline(""); setCreateFee(""); setCreateRequiresPayment(false);
      toast({ title: "League created successfully" });
    } catch (error: any) {
      toast({ title: "Error creating league", description: error.message, variant: "destructive" });
    } finally {
      setCreateLoading(false);
    }
  };

  return (
    <div className="container mx-auto p-4 md:p-8 space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Leagues</h1>
          <p className="text-muted-foreground mt-1">Create a league or join one with a code.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {/* Join with code */}
          <Dialog open={isJoinOpen} onOpenChange={open => { setIsJoinOpen(open); if (!open) setJoinCode(""); }}>
            <DialogTrigger asChild>
              <Button variant="outline" className="gap-2">
                <KeyRound className="h-4 w-4" />Join with Code
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[380px]">
              <DialogHeader>
                <DialogTitle>Join a League</DialogTitle>
                <DialogDescription>Enter the 6-character code shared by the league admin.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <div className="space-y-2">
                  <Label>League Code</Label>
                  <Input
                    placeholder="e.g. AB12CD"
                    value={joinCode}
                    onChange={e => setJoinCode(e.target.value.toUpperCase())}
                    maxLength={6}
                    className="text-center text-xl font-mono tracking-widest uppercase"
                    onKeyDown={e => e.key === "Enter" && handleJoinByCode()}
                  />
                </div>
              </div>
              <DialogFooter className="pt-2">
                <Button onClick={handleJoinByCode} disabled={joinLoading || joinCode.length < 6} className="w-full">
                  {joinLoading ? "Checking..." : "Join League"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Create league */}
          <Dialog open={isCreateOpen} onOpenChange={open => { setIsCreateOpen(open); if (!open) { setCreateName(""); setCreateDesc(""); setCreateMax(""); setCreateDeadline(""); setCreateFee(""); setCreateRequiresPayment(false); } }}>
            <DialogTrigger asChild>
              <Button className="gap-2"><ShieldPlus className="h-4 w-4" />Create League</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[440px]">
              <DialogHeader>
                <DialogTitle>Create New League</DialogTitle>
                <DialogDescription>A unique join code will be generated automatically.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 pt-2 max-h-[70vh] overflow-y-auto pr-1">
                <div className="space-y-2">
                  <Label>League Name *</Label>
                  <Input placeholder="e.g. Premier Elite Season 1" value={createName} onChange={e => setCreateName(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Description</Label>
                  <Input placeholder="Brief rules or description..." value={createDesc} onChange={e => setCreateDesc(e.target.value)} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Max Members</Label>
                    <Input type="number" placeholder="e.g. 16" min="2" value={createMax} onChange={e => setCreateMax(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Reg. Deadline</Label>
                    <Input type="date" value={createDeadline} onChange={e => setCreateDeadline(e.target.value)} />
                  </div>
                </div>
                <div className="rounded-lg border border-border/50 p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-sm">Requires M-Pesa Payment</Label>
                      <p className="text-xs text-muted-foreground mt-0.5">Players must pay before joining</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setCreateRequiresPayment(p => !p)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${createRequiresPayment ? "bg-primary" : "bg-muted"}`}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${createRequiresPayment ? "translate-x-6" : "translate-x-1"}`} />
                    </button>
                  </div>
                  {createRequiresPayment && (
                    <div className="space-y-2">
                      <Label className="text-xs">Entry Fee (KES)</Label>
                      <Input type="number" placeholder="e.g. 500" min="0" value={createFee} onChange={e => setCreateFee(e.target.value)} />
                    </div>
                  )}
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

      {/* M-Pesa Payment dialog */}
      <Dialog open={!!pendingLeague} onOpenChange={open => !open && setPendingLeague(null)}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Pay to Join League</DialogTitle>
            <DialogDescription>{pendingLeague?.name}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {/* M-Pesa instructions */}
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-3">
              <p className="text-sm font-semibold text-primary">Lipa Na M-Pesa Instructions</p>
              <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
                <li>Go to M-Pesa on your phone</li>
                <li>Select <strong className="text-foreground">Lipa Na M-Pesa</strong></li>
                <li>Select <strong className="text-foreground">Buy Goods & Services</strong></li>
                <li>Enter Business Number: <strong className="text-primary font-mono">400200</strong></li>
                <li>Enter Account Number: <strong className="text-primary font-mono">01102884553001</strong></li>
                <li>Enter Amount: <strong className="text-primary">KES {pendingLeague?.entryFee ?? "—"}</strong></li>
                <li>Enter your PIN and confirm</li>
              </ol>
              <p className="text-xs text-muted-foreground">You will receive a confirmation SMS with a transaction code (e.g. QJK1234ABC).</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5 col-span-2">
                <Label>M-Pesa Transaction Code *</Label>
                <Input placeholder="e.g. QJK1234ABC" value={txCode}
                  onChange={e => setTxCode(e.target.value.toUpperCase())}
                  className="font-mono tracking-wider uppercase" />
              </div>
              <div className="space-y-1.5">
                <Label>Sender Phone *</Label>
                <Input placeholder="e.g. 0712345678" value={txPhone} onChange={e => setTxPhone(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Amount Paid (KES) *</Label>
                <Input type="number" placeholder={String(pendingLeague?.entryFee ?? 0)} value={txAmount} onChange={e => setTxAmount(e.target.value)} />
              </div>
            </div>
            <p className="text-xs text-muted-foreground bg-muted/30 rounded p-2 flex items-start gap-1.5">
              <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-yellow-400" />
              Admin will verify your transaction and approve your membership. You'll receive a notification once approved.
            </p>
          </div>
          <DialogFooter className="gap-2 pt-2">
            <Button variant="outline" onClick={() => setPendingLeague(null)}>Cancel</Button>
            <Button onClick={handleSubmitPayment} disabled={paymentLoading}>
              {paymentLoading ? "Submitting..." : "Submit Payment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {loading ? (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-52" />)}
        </div>
      ) : leagues.length === 0 ? (
        <Card className="border-dashed bg-muted/20">
          <CardContent className="flex flex-col items-center justify-center p-12 text-center">
            <Trophy className="h-12 w-12 text-muted-foreground mb-4 opacity-50" />
            <h3 className="text-lg font-semibold">No Leagues Found</h3>
            <p className="text-sm text-muted-foreground mt-2 max-w-md">Create a league to get started, or ask a league admin for their join code.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {leagues.filter(l => (l.memberUids?.length ?? 0) > 0).map(league => {
            const isMember = user && league.memberUids?.includes(user.uid);
            const isLeagueAdmin = user && league.adminUid === user.uid;
            const memberCount = league.memberUids?.length ?? 0;
            const slotsLeft = league.maxMembers ? league.maxMembers - memberCount : null;
            const deadlinePassed = league.registrationDeadline ? league.registrationDeadline < Date.now() : false;
            const myPayment = myPayments.find(p => p.leagueId === league.id);

            return (
              <Card key={league.id} className="bg-card/50 border-border/50 hover:border-primary/50 transition-colors flex flex-col">
                <CardHeader>
                  <div className="flex justify-between items-start gap-2">
                    <CardTitle className="line-clamp-1 text-base" title={league.name}>{league.name}</CardTitle>
                    <div className="flex gap-1 flex-wrap justify-end shrink-0">
                      <Badge variant={league.status === "active" ? "default" : "secondary"}>{league.status}</Badge>
                      {league.requiresPayment && <Badge variant="outline" className="border-yellow-500/50 text-yellow-400 text-xs"><Lock className="h-2.5 w-2.5 mr-1" />Paid</Badge>}
                    </div>
                  </div>
                  <CardDescription className="line-clamp-2 min-h-[36px]">{league.description || "No description provided."}</CardDescription>
                </CardHeader>
                <CardContent className="flex-1 space-y-2">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Users className="h-4 w-4" />
                    <span>{memberCount} Members{slotsLeft !== null ? ` · ${slotsLeft} slots left` : ""}</span>
                  </div>
                  {league.entryFee ? (
                    <div className="text-sm text-muted-foreground">Entry Fee: <span className="text-primary font-semibold">KES {league.entryFee}</span></div>
                  ) : null}
                  {league.registrationDeadline && (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Calendar className="h-3.5 w-3.5" />
                      <span>Reg. closes: {format(new Date(league.registrationDeadline), "MMM d, yyyy")}</span>
                      {deadlinePassed && <Badge variant="destructive" className="text-[10px] py-0">Closed</Badge>}
                    </div>
                  )}
                  {isLeagueAdmin && league.joinCode && (
                    <div className="flex items-center gap-1.5 pt-1">
                      <KeyRound className="h-3.5 w-3.5 text-primary shrink-0" />
                      <span className="font-mono font-bold text-primary tracking-widest text-sm">{league.joinCode}</span>
                      <button onClick={() => copyCode(league.joinCode)} className="text-muted-foreground hover:text-foreground transition-colors ml-1">
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => shareCode(league)} className="text-muted-foreground hover:text-foreground transition-colors">
                        <Share2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                  {myPayment && (
                    <div className={`flex items-center gap-1.5 text-xs rounded px-2 py-1 ${myPayment.status === "approved" ? "bg-primary/10 text-primary" : myPayment.status === "rejected" ? "bg-destructive/10 text-destructive" : "bg-yellow-500/10 text-yellow-400"}`}>
                      <CheckCircle2 className="h-3 w-3" />
                      Payment {myPayment.status}
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
                      variant="outline" className="w-full"
                      disabled={deadlinePassed || league.status !== "active" || (slotsLeft !== null && slotsLeft <= 0)}
                      onClick={() => { setJoinCode(""); setIsJoinOpen(true); }}
                    >
                      <KeyRound className="h-4 w-4 mr-2" />
                      {deadlinePassed ? "Closed" : slotsLeft !== null && slotsLeft <= 0 ? "Full" : "Join with Code"}
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
