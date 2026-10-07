import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  getGetParticipantSessionQueryKey,
  useCreateParticipantAccount,
  useGetParticipantSession,
  useSignInParticipant,
  useSignOutParticipant,
} from '@workspace/api-client-react';

const participantSessionKey = getGetParticipantSessionQueryKey();

export function useParticipantAuth() {
  const queryClient = useQueryClient();
  const session = useGetParticipantSession({ query: { queryKey: participantSessionKey, retry: false, refetchOnWindowFocus: true, refetchInterval: 60_000 } });
  const createAccount = useCreateParticipantAccount({ mutation: { gcTime: 0 } });
  const signIn = useSignInParticipant({ mutation: { gcTime: 0 } });
  const signOut = useSignOutParticipant();
  const sessionKey = participantSessionKey;

  const refresh = useCallback(async () => {
    await session.refetch();
  }, [session.refetch]);

  const acceptSession = useCallback(async (result: Awaited<ReturnType<typeof createAccount.mutateAsync>>) => {
    queryClient.setQueryData(sessionKey, result);
    await queryClient.invalidateQueries({ queryKey: sessionKey });
  }, [createAccount.mutateAsync, queryClient, sessionKey]);

  const signup = useCallback(async (data: { username: string; email: string; password: string }) => {
    try {
      const result = await createAccount.mutateAsync({ data });
      await acceptSession(result);
      return result;
    } finally { createAccount.reset(); }
  }, [acceptSession, createAccount.mutateAsync]);

  const signin = useCallback(async (data: { identifier: string; password: string }) => {
    try {
      const result = await signIn.mutateAsync({ data });
      await acceptSession(result);
      return result;
    } finally { signIn.reset(); }
  }, [acceptSession, signIn.mutateAsync]);

  const clearParticipantCache = useCallback(() => {
    queryClient.removeQueries({
      predicate: (query) => typeof query.queryKey[0] === 'string'
        && query.queryKey[0].startsWith('/api/participant-')
        && query.queryKey[0] !== sessionKey[0],
    });
  }, [queryClient, sessionKey]);

  const logout = useCallback(async () => {
    await signOut.mutateAsync();
    clearParticipantCache();
    queryClient.setQueryData(sessionKey, { user: null });
    await session.refetch();
  }, [clearParticipantCache, queryClient, session.refetch, sessionKey, signOut.mutateAsync]);

  return {
    user: session.data?.user ?? null,
    isLoading: session.isLoading,
    isRefreshing: session.isFetching,
    hasError: session.isError,
    error: session.error,
    refresh,
    signup,
    signin,
    logout,
    clearParticipantCache,
    isMutating: createAccount.isPending || signIn.isPending || signOut.isPending,
  };
}
