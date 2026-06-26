import { db } from "@/lib/firebase";
import { collection, addDoc } from "firebase/firestore";

export async function createNotification(
  uid: string,
  title: string,
  message: string,
  type: string,
  extra?: { leagueId?: string; matchId?: string; paymentId?: string }
) {
  try {
    await addDoc(collection(db, "notifications"), {
      uid,
      title,
      message,
      type,
      read: false,
      createdAt: Date.now(),
      ...(extra ?? {}),
    });
  } catch (e) {
    console.error("createNotification failed:", e);
  }
}

export async function createBulkNotifications(
  uids: string[],
  title: string,
  message: string,
  type: string,
  extra?: { leagueId?: string; matchId?: string; paymentId?: string }
) {
  await Promise.all(uids.map(uid => createNotification(uid, title, message, type, extra)));
}
