import { useEffect } from "react";
import { Redirect, Route, Switch, useLocation, useParams } from "wouter";
import { Show } from "@clerk/react";
import { Shell } from "@/components/layout/Shell";
import { WorkspaceLayout } from "@/components/layout/WorkspaceLayout";
import { WorkspaceAuthBoundary } from "@/components/layout/WorkspaceAuthBoundary";
import Home from "@/pages/Home";
import TutorProfile from "@/pages/TutorProfile";
import Resources from "@/pages/Resources";
import ResourceDetail from "@/pages/ResourceDetail";
import Enquiry from "@/pages/Enquiry";
import NotFound from "@/pages/not-found";
import SignInPage from "@/pages/auth/sign-in";
import SignUpPage from "@/pages/auth/sign-up";
import WorkspaceDashboard from "@/pages/workspace/dashboard";
import WorkspaceAccounts from "@/pages/workspace/accounts";
import WorkspaceTutorProfiles from "@/pages/workspace/tutor-profiles";
import WorkspaceResourceEditor from "@/pages/workspace/resource-editor";
import WorkspaceProfile from "@/pages/workspace/profile";
import {
  legacyWorkspaceResourcePath,
  routeMetadataForPath,
  routePaths,
  workspaceSignedOutRedirect,
} from "./route-map";

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
            <Switch>
              <Route path={routePaths.workspace.root} component={WorkspaceDashboard} />
              <Route path={routePaths.workspace.accounts} component={WorkspaceAccounts} />
              <Route path={routePaths.workspace.tutors} component={WorkspaceTutorProfiles} />
              <Route path={routePaths.workspace.profile} component={WorkspaceProfile} />
              <Route path={routePaths.workspace.resourceNew} component={WorkspaceResourceEditor} />
              <Route path={routePaths.workspace.resource} component={WorkspaceResourceEditor} />
              <Route path={routePaths.workspace.legacyResourceNew} component={LegacyWorkspaceResourceRedirect} />
              <Route path={routePaths.workspace.legacyResource} component={LegacyWorkspaceResourceRedirect} />
              <Route component={NotFound} />
            </Switch>
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
          </Shell>
        </Route>
      </Switch>
    </>
  );
}