export interface User {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  isAdmin: boolean;
  createdAt: number;
}

export interface League {
  id: string;
  name: string;
  description: string;
  adminUid: string;
  createdAt: number;
  status: "active" | "completed";
  memberUids: string[];
  joinCode: string;
}

export interface Team {
  id: string;
  name: string;
  leagueId: string;
  ownerUid: string;
  logoURL?: string;
  createdAt: number;
}

export interface Match {
  id: string;
  leagueId: string;
  homeTeamId: string;
  awayTeamId: string;
  homeTeamName: string;
  awayTeamName: string;
  scheduledDate: number; // Storing as timestamp for easier manipulation
  status: "scheduled" | "pending_approval" | "approved" | "rejected";
  submittedByUid?: string;
  homeScore?: number;
  awayScore?: number;
  resultNotes?: string;
  createdAt: number;
  updatedAt: number;
}
