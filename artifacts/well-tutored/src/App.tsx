import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { Route, Switch, Router as WouterRouter, useLocation, Redirect } from 'wouter';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Shell } from '@/components/layout/Shell';
import { WorkspaceLayout } from '@/components/layout/WorkspaceLayout';
import { WorkspaceAuthBoundary } from '@/components/layout/WorkspaceAuthBoundary';
import { ClerkProvider, Show, useClerk } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import { useQueryClient } from '@tanstack/react-query';

import Home from '@/pages/Home';
import TutorProfile from '@/pages/TutorProfile';
import Resources from '@/pages/Resources';
import ResourceArticle from '@/pages/ResourceArticle';
import Enquiry from '@/pages/Enquiry';
import NotFound from '@/pages/not-found';
import SignInPage from '@/pages/auth/sign-in';
import SignUpPage from '@/pages/auth/sign-up';
import WorkspaceDashboard from '@/pages/workspace/dashboard';
import WorkspaceAccounts from '@/pages/workspace/accounts';
import WorkspaceTutorProfiles from '@/pages/workspace/tutor-profiles';
import WorkspaceArticleEditor from '@/pages/workspace/article-editor';
import WorkspaceProfile from '@/pages/workspace/profile';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function RouteMeta() {
  const [location] = useLocation();

  useEffect(() => {
    const humanize = (value: string) =>
      value
        .split('-')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');

    let title = 'Well Tutored | Women tutors for secondary and A-level students';
    let description =
      'Browse women tutors educated at Russell Group universities, read their subject resources and submit a named-tutor enquiry.';

    if (location === '/resources') {
      title = 'Insights & Resources | Well Tutored';
      description = 'Read illustrative guides, revision notes and subject resources from Well Tutored tutors.';
    } else if (location.startsWith('/resources/')) {
      title = `${humanize(location.replace('/resources/', ''))} | Well Tutored Resources`;
      description = 'Read an illustrative tutor-written resource from Well Tutored.';
    } else if (location.startsWith('/tutors/')) {
      title = `${humanize(location.replace('/tutors/', ''))} | Well Tutored`;
      description = 'View this tutor’s subject expertise, qualifications, teaching style and named-tutor enquiry form.';
    } else if (location === '/enquire') {
      title = 'Make an Enquiry | Well Tutored';
      description = 'Tell Well Tutored which tutor you are interested in and what support would help.';
    } else if (location.startsWith('/workspace')) {
      title = 'Workspace | Well Tutored';
      description = 'Shared workspace for tutor profiles and resources.';
    }

    document.title = title;
    for (const [selector, content] of [
      ['meta[name="description"]', description],
      ['meta[property="og:title"]', title],
      ['meta[property="og:description"]', description],
      ['meta[name="twitter:title"]', title],
      ['meta[name="twitter:description"]', description],
    ]) {
      document.querySelector<HTMLMetaElement>(selector)?.setAttribute('content', content);
    }
  }, [location]);

  return null;
}

function WorkspaceRoutes() {
  return (
    <>
      <Show when="signed-in">
        <WorkspaceLayout>
          <WorkspaceAuthBoundary>
            <Switch>
              <Route path="/workspace" component={WorkspaceDashboard} />
              <Route path="/workspace/accounts" component={WorkspaceAccounts} />
              <Route path="/workspace/tutors" component={WorkspaceTutorProfiles} />
              <Route path="/workspace/profile" component={WorkspaceProfile} />
              <Route path="/workspace/articles/new" component={WorkspaceArticleEditor} />
              <Route path="/workspace/articles/:id" component={WorkspaceArticleEditor} />
              <Route component={NotFound} />
            </Switch>
          </WorkspaceAuthBoundary>
        </WorkspaceLayout>
      </Show>
      <Show when="signed-out">
        <Redirect to="/sign-in" />
      </Show>
    </>
  );
}

function Router() {
  return (
    <>
      <RouteMeta />
      <Switch>
        <Route path="/workspace/*?" component={WorkspaceRoutes} />
        <Route>
          <Shell>
            <Switch>
              <Route path="/" component={Home} />
              <Route path="/tutors/:slug" component={TutorProfile} />
              <Route path="/resources" component={Resources} />
              <Route path="/resources/:slug" component={ResourceArticle} />
              <Route path="/enquire" component={Enquiry} />
              <Route path="/sign-in/*?" component={SignInPage} />
              <Route path="/sign-up/*?" component={SignUpPage} />
              <Route component={NotFound} />
            </Switch>
          </Shell>
        </Route>
      </Switch>
    </>
  );
}

const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;

function stripBase(path: string) {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || '/'
    : path;
}

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

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      appearance={{
        theme: shadcn,
        cssLayerName: 'clerk',
        options: {
          logoPlacement: 'inside',
          logoLinkUrl: basePath || '/',
          logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
        },
        variables: {
          colorPrimary: 'hsl(15, 58%, 48%)',
          colorForeground: 'hsl(218, 18%, 18%)',
          colorMutedForeground: 'hsl(218, 10%, 43%)',
          colorBackground: 'hsl(42, 60%, 98%)',
          colorInput: 'hsl(40, 44%, 94%)',
          colorInputForeground: 'hsl(218, 18%, 18%)',
          colorDanger: 'hsl(3, 65%, 43%)',
          colorNeutral: 'hsl(35, 22%, 80%)',
          borderRadius: '0',
          fontFamily: 'DM Sans, sans-serif',
          fontFamilyButtons: 'DM Sans, sans-serif',
        },
        elements: {
          rootBox: 'w-full flex justify-center',
          cardBox: 'bg-card w-[440px] max-w-full overflow-hidden border border-border',
          card: '!shadow-none !border-0 !bg-transparent !rounded-none',
          footer: '!shadow-none !border-0 !bg-transparent !rounded-none',
          headerTitle: 'font-serif text-foreground',
          headerSubtitle: 'text-muted-foreground',
          socialButtonsBlockButtonText: 'text-foreground',
          formFieldLabel: 'text-foreground',
          footerActionLink: 'text-primary',
          footerActionText: 'text-muted-foreground',
          dividerText: 'text-muted-foreground',
          identityPreviewEditButton: 'text-primary',
          formFieldSuccessText: 'text-foreground',
          alertText: 'text-foreground',
          logoImage: 'max-h-12',
          socialButtonsBlockButton: 'border-border rounded-none',
          formButtonPrimary: 'rounded-none',
          formFieldInput: 'rounded-none border-border',
          dividerLine: 'bg-border',
          alert: 'border-border rounded-none',
          otpCodeFieldInput: 'rounded-none border-border',
        }
      }}
      localization={{
        signIn: {
          start: {
            title: 'Welcome back',
            subtitle: 'Sign in to manage your profile and writing',
          },
        },
        signUp: {
          start: {
            title: 'Join the Workspace',
            subtitle: 'Create an account for owner approval',
          },
        },
      }}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <ClerkQueryClientCacheInvalidator />
        <TooltipProvider>
          <ErrorBoundary>
            <Router />
          </ErrorBoundary>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function App() {
  return (
    <WouterRouter base={basePath}>
      <ClerkProviderWithRoutes />
    </WouterRouter>
  );
}

export default App;