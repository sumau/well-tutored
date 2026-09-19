import { type ReactNode, useEffect, useRef } from "react";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { ClerkProvider, useClerk } from "@clerk/react";
import { shadcn } from "@clerk/themes";
import { useLocation } from "wouter";
import { ErrorBoundary } from "@/components/error-boundary";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { basePath, clerkProxyUrl, clerkPubKey, stripBase } from "./config";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const client = useQueryClient();
  const previousUserId = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    return addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (
        previousUserId.current !== undefined &&
        previousUserId.current !== userId
      ) {
        client.clear();
      }
      previousUserId.current = userId;
    });
  }, [addListener, client]);

  return null;
}

export function ClerkApp({ children }: { children: ReactNode }) {
  const [, setLocation] = useLocation();

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      appearance={{
        theme: shadcn,
        cssLayerName: "clerk",
        options: {
          logoPlacement: "inside",
          logoLinkUrl: basePath || "/",
          logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
        },
        variables: {
          colorPrimary: "hsl(15, 58%, 48%)",
          colorForeground: "hsl(218, 18%, 18%)",
          colorMutedForeground: "hsl(218, 10%, 43%)",
          colorBackground: "hsl(42, 60%, 98%)",
          colorInput: "hsl(40, 44%, 94%)",
          colorInputForeground: "hsl(218, 18%, 18%)",
          colorDanger: "hsl(3, 65%, 43%)",
          colorNeutral: "hsl(35, 22%, 80%)",
          borderRadius: "0",
          fontFamily: "DM Sans, sans-serif",
          fontFamilyButtons: "DM Sans, sans-serif",
        },
        elements: {
          rootBox: "w-full flex justify-center",
          cardBox: "bg-card w-[440px] max-w-full overflow-hidden border border-border",
          card: "!shadow-none !border-0 !bg-transparent !rounded-none",
          footer: "!shadow-none !border-0 !bg-transparent !rounded-none",
          headerTitle: "font-serif text-foreground",
          headerSubtitle: "text-muted-foreground",
          socialButtonsBlockButtonText: "text-foreground",
          formFieldLabel: "text-foreground",
          footerActionLink: "text-primary",
          footerActionText: "text-muted-foreground",
          dividerText: "text-muted-foreground",
          identityPreviewEditButton: "text-primary",
          formFieldSuccessText: "text-foreground",
          alertText: "text-foreground",
          logoImage: "max-h-12",
          socialButtonsBlockButton: "border-border rounded-none",
          formButtonPrimary: "rounded-none",
          formFieldInput: "rounded-none border-border",
          dividerLine: "bg-border",
          alert: "border-border rounded-none",
          otpCodeFieldInput: "rounded-none border-border",
        },
      }}
      localization={{
        signIn: {
          start: {
            title: "Welcome back",
            subtitle: "Sign in to manage your profile and writing",
          },
        },
        signUp: {
          start: {
            title: "Join the Workspace",
            subtitle: "Create an account for owner approval",
          },
        },
      }}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <ClerkQueryClientCacheInvalidator />
        <TooltipProvider>
          <ErrorBoundary>{children}</ErrorBoundary>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}