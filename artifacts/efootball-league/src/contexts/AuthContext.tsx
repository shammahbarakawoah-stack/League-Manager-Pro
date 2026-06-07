import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  User as FirebaseUser
} from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { User } from "@/lib/types";

interface AuthContextType {
  user: FirebaseUser | null;
  userData: User | null;
  loading: boolean;
  isAdmin: boolean;
  signIn: (e: string, p: string) => Promise<void>;
  signUp: (e: string, p: string, d: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [userData, setUserData] = useState<User | null>(null);
  // loading is only true until Firebase tells us the auth state — not until Firestore resolves
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setLoading(false); // unblock the UI immediately

      if (firebaseUser) {
        // Fetch user doc in the background — does NOT block page render
        getDoc(doc(db, "users", firebaseUser.uid))
          .then((snap) => {
            if (snap.exists()) setUserData(snap.data() as User);
          })
          .catch((err) => console.error("Error fetching user data:", err));
      } else {
        setUserData(null);
      }
    });

    return () => unsubscribe();
  }, []);

  const signIn = async (email: string, pass: string) => {
    await signInWithEmailAndPassword(auth, email, pass);
  };

  const signUp = async (email: string, pass: string, displayName: string) => {
    const { user: newUser } = await createUserWithEmailAndPassword(auth, email, pass);
    const newUserData: User = {
      uid: newUser.uid,
      email,
      displayName,
      isAdmin: false,
      createdAt: Date.now()
    };
    await setDoc(doc(db, "users", newUser.uid), newUserData);
    setUserData(newUserData);
  };

  const signOut = async () => {
    await firebaseSignOut(auth);
    setUserData(null);
  };

  return (
    <AuthContext.Provider value={{
      user,
      userData,
      loading,
      isAdmin: !!userData?.isAdmin,
      signIn,
      signUp,
      signOut
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
