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
  requiresPayment?: boolean;
  entryFee?: number;
  maxMembers?: number;
  registrationDeadline?: number;
}

export interface Team {
  id: string;
  name: string;
  leagueId: string;
  ownerUid: string;
  logoURL?: string | null;
  squad?: string[];
  createdAt: number;
}

export interface MatchSubmission {
  uid: string;
  homeScore: number;
  awayScore: number;
  scorers: string[];
  assists: string[];
  submittedAt: number;
}

export interface Match {
  id: string;
  leagueId: string;
  homeTeamId: string;
  awayTeamId: string;
  homeTeamName: string;
  awayTeamName: string;
  scheduledDate: number;
  status: "scheduled" | "pending_approval" | "disputed" | "approved" | "rejected";
  submittedByUid?: string;
  homeScore?: number;
  awayScore?: number;
  scorers?: string[];
  assists?: string[];
  resultNotes?: string;
  leg?: 1 | 2;
  matchday?: number;
  homeSubmission?: MatchSubmission;
  awaySubmission?: MatchSubmission;
  createdAt: number;
  updatedAt: number;
}

export interface Payment {
  id: string;
  leagueId: string;
  leagueName?: string;
  uid: string;
  displayName: string;
  transactionCode: string;
  phoneNumber: string;
  amount: number;
  status: "pending" | "approved" | "rejected" | "resubmit";
  adminNote?: string;
  createdAt: number;
  updatedAt: number;
}

export interface AppNotification {
  id: string;
  uid: string;
  title: string;
  message: string;
  type: string;
  read: boolean;
  leagueId?: string;
  matchId?: string;
  paymentId?: string;
  createdAt: number;
}
