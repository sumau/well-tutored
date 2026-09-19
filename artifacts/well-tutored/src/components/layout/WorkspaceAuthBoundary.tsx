import { ReactNode } from "react";
import { useGetWorkspaceSession } from "@workspace/api-client-react";
import { AlertCircle, Clock3 } from "lucide-react";
import { useAuth, useClerk } from "@clerk/react";
import { Button } from "@/components/ui/button";

export function WorkspaceAuthBoundary({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth();
  const { signOut } = useClerk();
  const {
    data: session,
    isLoading,
    isError,
    isFetching,
    refetch,
  } = useGetWorkspaceSession({
    query: {
      enabled: isLoaded && isSignedIn,
      retry: false,
    },
  });

  if (!isLoaded || !isSignedIn || isLoading) {
    return (
      <div className="flex-1 min-h-[60vh] p-6 md:p-12">
        <div className="max-w-[1120px] mx-auto space-y-6">
          <div className="h-3 w-24 rounded skeleton-shimmer" />
          <div className="h-14 w-2/3 max-w-[480px] rounded skeleton-shimmer" />
          <div className="grid md:grid-cols-3 gap-4">
            <div className="h-36 rounded skeleton-shimmer" />
            <div className="h-36 rounded skeleton-shimmer" />
            <div className="h-36 rounded skeleton-shimmer" />
          </div>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-[50vh] p-6 text-center">
        <AlertCircle className="w-10 h-10 text-destructive mb-4" />
        <h2 className="text-xl font-serif mb-2">Authentication Error</h2>
        <p className="text-sm text-muted-foreground mb-6">
          We could not load your workspace session.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
            {isFetching ? "Retrying..." : "Try again"}
          </Button>
          <Button variant="ghost" onClick={() => signOut()}>
            Sign out
          </Button>
        </div>
      </div>
    );
  }

  if (session?.role === "pending") {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-[50vh] p-6 text-center max-w-md mx-auto">
        <Clock3 className="w-9 h-9 text-primary mb-5" strokeWidth={1.5} />
        <h2 className="text-2xl font-serif mb-3">Awaiting approval</h2>
        <p className="text-sm text-muted-foreground mb-8">
          Your account has been created successfully. The agency owner will
          review your details and activate your profile soon.
        </p>
        <Button variant="outline" onClick={() => signOut()}>
          Sign Out
        </Button>
      </div>
    );
  }

  return <div className="flex-1 bg-muted/20">{children}</div>;
}