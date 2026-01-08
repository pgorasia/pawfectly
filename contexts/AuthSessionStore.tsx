/**
 * Auth Session Store
 * Manages bootstrap cancellation and account deletion state
 * Prevents stale bootstrap operations from executing after sign-out/deletion
 */

import React, { createContext, useContext, useState, useRef, useCallback, ReactNode, useEffect } from 'react';
import { setGlobalIsDeletingAccount } from '@/services/profile/statusRepository';

interface AuthSessionStoreType {
  currentUserId: string | null;
  isDeletingAccount: boolean;
  bootstrapRunId: number; // Current run ID (read-only, for initial capture)
  getBootstrapRunId: () => number; // Function to get latest run ID (always current)
  getIsDeletingAccount: () => boolean; // Function to get current deletion state (always current)
  setCurrentUserId: (userId: string | null) => void;
  setDeletingAccount: (flag: boolean) => void;
  bumpBootstrapRunId: () => number;
}

const AuthSessionStoreContext = createContext<AuthSessionStoreType | undefined>(undefined);

export const AuthSessionStoreProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const bootstrapRunIdRef = useRef(0);
  const isDeletingAccountRef = useRef(false);

  const bumpBootstrapRunId = useCallback(() => {
    bootstrapRunIdRef.current += 1;
    return bootstrapRunIdRef.current;
  }, []);

  const handleSetDeletingAccount = useCallback((flag: boolean) => {
    setIsDeletingAccount(flag);
    setGlobalIsDeletingAccount(flag);
    // Bump bootstrap run ID when deletion starts to cancel in-flight bootstrap operations
    if (flag) {
      bumpBootstrapRunId();
    }
  }, [bumpBootstrapRunId]);

  // Sync global flag and ref when isDeletingAccount changes
  useEffect(() => {
    isDeletingAccountRef.current = isDeletingAccount;
    setGlobalIsDeletingAccount(isDeletingAccount);
  }, [isDeletingAccount]);

  return (
    <AuthSessionStoreContext.Provider
      value={{
        currentUserId,
        isDeletingAccount,
        bootstrapRunId: bootstrapRunIdRef.current,
        getBootstrapRunId: () => bootstrapRunIdRef.current,
        getIsDeletingAccount: () => isDeletingAccountRef.current,
        setCurrentUserId,
        setDeletingAccount: handleSetDeletingAccount,
        bumpBootstrapRunId,
      }}
    >
      {children}
    </AuthSessionStoreContext.Provider>
  );
};

export const useAuthSessionStore = () => {
  const context = useContext(AuthSessionStoreContext);
  if (context === undefined) {
    throw new Error('useAuthSessionStore must be used within an AuthSessionStoreProvider');
  }
  return context;
};
