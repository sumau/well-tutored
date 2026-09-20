import { lazy, Suspense, useEffect } from "react";
import { Redirect, Route, Switch, useLocation, useParams } from "wouter";
import { Show } from "@clerk/react";
import { Shell } from "@/components/layout/Shell";
import { WorkspaceLayout } from "@/components/layout/WorkspaceLayout";
import { WorkspaceAuthBoundary } from "@/components/layout/WorkspaceAuthBoundary";
import { LoadingState } from "@/components/LoadingState";
import NotFound from "@/pages/not-found";
import {
  legacyWorkspaceResourcePath,
  routeMetadataForPath,
  routePaths,
  workspaceSignedOutRedirect,
} from "./route-map";

const Home = lazy(() => import("@/pages/Home"));
const TutorProfile = lazy(() => import("@/pages/TutorProfile"));
const Resources = lazy(() => import("@/pages/Resources"));
const ResourceDetail = lazy(() => import("@/pages/ResourceDetail"));
const Enquiry = lazy(() => import("@/pages/Enquiry"));
const SignInPage = lazy(() => import("@/pages/auth/sign-in"));
const SignUpPage = lazy(() => import("@/pages/auth/sign-up"));
const WorkspaceDashboard = lazy(() => import("@/pages/workspace/dashboard"));
const WorkspaceEnquiries = lazy(() => import("@/pages/workspace/enquiries"));
const WorkspaceAccounts = lazy(() => import("@/pages/workspace/accounts"));
const WorkspaceTutorProfiles = lazy(() => import("@/pages/workspace/tutor-profiles"));
const WorkspaceResourceEditor = lazy(() => import("@/pages/workspace/resource-editor"));
const WorkspaceProfile = lazy(() => import("@/pages/workspace/profile"));

function RouteLoading({ message }: { message: string }) {
  return <LoadingState message={message} />;
}

function RouteMeta() {
  const [location] = useLocation();

  useEffect(() => {
    const { title, description } = routeMetadataForPath(location);

    document.title = title;
    for (const [selector, content] of [
      ["meta[name=\"description\"]", description],
      ["meta[property=\"og:title\"]", title],
      ["meta[property=\"og:description\"]", description],
      ["meta[name=\"twitter:title\"]", title],
      ["meta[name=\"twitter:description\"]", description],
    ]) {
      document.querySelector<HTMLMetaElement>(selector)?.setAttribute("content", content);
    }
  }, [location]);

  return null;
}

function LegacyWorkspaceResourceRedirect() {
  const params = useParams<{ id?: string }>();
  return (
    <Redirect to={legacyWorkspaceResourcePath(params.id)} />
  );
}

function WorkspaceRoutes() {
  return (
    <>
      <Show when="signed-in">
        <WorkspaceLayout>
          <WorkspaceAuthBoundary>
            <Suspense fallback={<RouteLoading message="Loading workspace..." />}>
              <Switch>
                <Route path={routePaths.workspace.root} component={WorkspaceDashboard} />
                <Route path={routePaths.workspace.enquiries} component={WorkspaceEnquiries} />
                <Route path={routePaths.workspace.accounts} component={WorkspaceAccounts} />
                <Route path={routePaths.workspace.tutors} component={WorkspaceTutorProfiles} />
                <Route path={routePaths.workspace.profile} component={WorkspaceProfile} />
                <Route path={routePaths.workspace.resourceNew} component={WorkspaceResourceEditor} />
                <Route path={routePaths.workspace.resource} component={WorkspaceResourceEditor} />
                <Route path={routePaths.workspace.legacyResourceNew} component={LegacyWorkspaceResourceRedirect} />
                <Route path={routePaths.workspace.legacyResource} component={LegacyWorkspaceResourceRedirect} />
                <Route component={NotFound} />
              </Switch>
            </Suspense>
          </WorkspaceAuthBoundary>
        </WorkspaceLayout>
      </Show>
      <Show when="signed-out">
        <Redirect to={workspaceSignedOutRedirect()} />
      </Show>
    </>
  );
}

export function AppRoutes() {
  return (
    <>
      <RouteMeta />
      <Switch>
        <Route path={routePaths.workspace.wildcard} component={WorkspaceRoutes} />
        <Route>
          <Shell>
            <Suspense fallback={<RouteLoading message="Loading page..." />}>
              <Switch>
                <Route path={routePaths.public.home} component={Home} />
                <Route path={routePaths.public.tutorProfile} component={TutorProfile} />
                <Route path={routePaths.public.resources} component={Resources} />
                <Route path={routePaths.public.resourceDetail} component={ResourceDetail} />
                <Route path={routePaths.public.enquiry} component={Enquiry} />
                <Route path={routePaths.auth.signIn} component={SignInPage} />
                <Route path={routePaths.auth.signUp} component={SignUpPage} />
                <Route component={NotFound} />
              </Switch>
            </Suspense>
          </Shell>
        </Route>
      </Switch>
    </>
  );
}