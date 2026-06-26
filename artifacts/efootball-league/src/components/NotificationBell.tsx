import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/lib/firebase";
import { collection, query, where, onSnapshot, updateDoc, doc, writeBatch } from "firebase/firestore";
import { AppNotification } from "@/lib/types";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

const typeColors: Record<string, string> = {
  payment_approved: "bg-primary/20 text-primary",
  payment_rejected: "bg-destructive/20 text-destructive",
  payment_pending: "bg-yellow-500/20 text-yellow-400",
  dispute: "bg-orange-500/20 text-orange-400",
  announcement: "bg-blue-500/20 text-blue-400",
  match: "bg-primary/20 text-primary",
  default: "bg-muted/50 text-muted-foreground",
};

export function NotificationBell() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, "notifications"),
      where("uid", "==", user.uid)
    );
    const unsub = onSnapshot(q, snap => {
      const all = snap.docs
        .map(d => ({ id: d.id, ...d.data() } as AppNotification))
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, 30);
      setNotifications(all);
    });
    return () => unsub();
  }, [user]);

  const unread = notifications.filter(n => !n.read).length;

  const markRead = async (id: string) => {
    await updateDoc(doc(db, "notifications", id), { read: true });
  };

  const markAllRead = async () => {
    const batch = writeBatch(db);
    notifications.filter(n => !n.read).forEach(n => {
      batch.update(doc(db, "notifications", n.id), { read: true });
    });
    await batch.commit();
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {unread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-white">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0 shadow-xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <span className="font-semibold text-sm">Notifications</span>
          {unread > 0 && (
            <button onClick={markAllRead} className="text-xs text-primary hover:underline">
              Mark all read
            </button>
          )}
        </div>
        <div className="max-h-96 overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">No notifications yet.</div>
          ) : (
            notifications.map(n => (
              <div
                key={n.id}
                onClick={() => !n.read && markRead(n.id)}
                className={cn(
                  "flex gap-3 px-4 py-3 border-b border-border/50 cursor-pointer hover:bg-accent/30 transition-colors",
                  !n.read && "bg-accent/20"
                )}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-start gap-2">
                    <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 mt-0.5", typeColors[n.type] ?? typeColors.default)}>
                      {n.type.replace(/_/g, " ").toUpperCase()}
                    </span>
                    {!n.read && <span className="h-1.5 w-1.5 rounded-full bg-primary mt-1.5 shrink-0" />}
                  </div>
                  <p className="text-sm font-medium mt-1 leading-snug">{n.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{n.message}</p>
                  <p className="text-[10px] text-muted-foreground/70 mt-1">
                    {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
