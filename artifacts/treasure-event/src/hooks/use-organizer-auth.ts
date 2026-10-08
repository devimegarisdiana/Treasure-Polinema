import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  getGetOrganizerSessionQueryKey,
  useGetOrganizerSession,
  useSignInOrganizer,
  useSignOutOrganizer,
} from '@workspace/api-client-react';

const organizerSessionKey = getGetOrganizerSessionQueryKey();
const isHttp401 = (error: unknown) => (error as { status?: number } | null)?.status === 401;
const isPrivateAdminQuery = (queryKey: readonly unknown[]) =>
  typeof queryKey[0] === 'string' && queryKey[0].startsWith('/api/admin/');

export function useOrganizerAuth() {
  const queryClient = useQueryClient();
  const session = useGetOrganizerSession({
    query: {
      queryKey: organizerSessionKey,
      retry: false,
      refetchOnWindowFocus: true,
      refetchInterval: 30_000,
    },
  });
  const signInMutation = useSignInOrganizer({ mutation: { gcTime: 0 } });
  const signOutMutation = useSignOutOrganizer();
  const [expired, setExpired] = useState(false);
  const [signinError, setSigninError] = useState<unknown>(null);
  const previousUserId = useRef<string | null>(null);

  const clearPrivateCache = useCallback(() => {
    queryClient.removeQueries({ predicate: (query) => isPrivateAdminQuery(query.queryKey) });
  }, [queryClient]);

  const expireSession = useCallback(() => {
    setExpired(true);
    clearPrivateCache();
    queryClient.setQueryData(organizerSessionKey, { user: null });
  }, [clearPrivateCache, queryClient]);

  const session401 = session.isError && isHttp401(session.error);
  const user = !expired && !session.isError ? session.data?.user ?? null : null;

  useEffect(() => {
    if (session401 && !expired) expireSession();
    else if (session.isError) clearPrivateCache();
  }, [session401, session.isError, expired, expireSession, clearPrivateCache]);

  useEffect(() => {
    const currentId = user?.id ?? null;
    if (previousUserId.current !== currentId) {
      if (previousUserId.current !== null || currentId !== null) clearPrivateCache();
      previousUserId.current = currentId;
    }
  }, [user?.id, clearPrivateCache]);

  const refetch = useCallback(async () => {
    await session.refetch();
  }, [session.refetch]);

  const signin = useCallback(async (credentials: { username: string; password: string }) => {
    setSigninError(null);
    setExpired(false);
    try {
      const result = await signInMutation.mutateAsync({ data: credentials });
      const newId = result.user?.id ?? null;
      if (previousUserId.current !== newId) clearPrivateCache();
      previousUserId.current = newId;
      queryClient.setQueryData(organizerSessionKey, result);
      await queryClient.invalidateQueries({ queryKey: organizerSessionKey });
      return result;
    } catch (error) {
      setSigninError(error);
      throw error;
    } finally {
      signInMutation.reset();
    }
  }, [clearPrivateCache, queryClient, signInMutation.mutateAsync, signInMutation.reset]);

  const logout = useCallback(async () => {
    // Hide protected records before waiting for the network.
    setExpired(true);
    clearPrivateCache();
    queryClient.setQueryData(organizerSessionKey, { user: null });
    try {
      await signOutMutation.mutateAsync();
    } finally {
      clearPrivateCache();
      queryClient.setQueryData(organizerSessionKey, { user: null });
    }
  }, [clearPrivateCache, queryClient, signOutMutation.mutateAsync]);

  return {
    user,
    isAuthenticated: !!user,
    isLoading: session.isLoading,
    isRefreshing: session.isFetching,
    isExpired: expired || session401,
    sessionError: session.isError ? session.error : null,
    signinError,
    refetchError: session.isError ? session.error : null,
    isSigningIn: signInMutation.isPending,
    isSigningOut: signOutMutation.isPending,
    signin,
    logout,
    refetch,
    clearPrivateCache,
    expireSession,
    clearSigninError: () => setSigninError(null),
  };
}
