import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ErrorBoundary } from "@/components/error-boundary";
import NotFound from "@/pages/not-found";
import { AppLayout } from "@/components/layout/app-layout";
import Landing from "@/pages/landing";
import Login from "@/pages/login";
import Register from "@/pages/register";
import { AuthProvider, useAuth } from "@/hooks/use-auth";

import Dashboard from "@/pages/dashboard";
import Accounts from "@/pages/accounts";
import Targets from "@/pages/targets";
import Jobs from "@/pages/jobs";
import Media from "@/pages/media";
import Posts from "@/pages/posts";
import Embeds from "@/pages/embeds";
import Ads from "@/pages/ads";
import Settings from "@/pages/settings";
import PostPreview from "@/pages/post-preview";
import Downloader from "@/pages/downloader";
import UpdatePage from "@/pages/update";
import ExtractorProfiles from "@/pages/extractor-profiles";
import AutoComments from "@/pages/auto-comments";
import MassGrabSchedules from "@/pages/mass-grab-schedules";
import WarmAccounts from "@/pages/warm-accounts";
import BackgroundJobs from "@/pages/background-jobs";
import AdminDashboard from "@/pages/admin/dashboard";
import AdminUsers from "@/pages/admin/users";
import AdminPricing from "@/pages/admin/pricing";
import AdminPayments from "@/pages/admin/payments";
import AdminTransactions from "@/pages/admin/transactions";
import AdminAffiliateLinks from "@/pages/admin/affiliate-links";
import AffiliateLinks from "@/pages/affiliate-links";
import Checkout from "@/pages/checkout";

const queryClient = new QueryClient();

function ProtectedRoute({ component: Component, adminOnly = false }: { component: React.ComponentType; adminOnly?: boolean }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return <Redirect to="/login" />;
  }

  if (adminOnly && user.role !== "admin") {
    return <Redirect to="/dashboard" />;
  }

  return <Component />;
}

function DashboardRouter() {
  return (
    <AppLayout>
      <Switch>
        <Route path="/dashboard" component={Dashboard} />
        <Route path="/accounts" component={Accounts} />
        <Route path="/targets" component={Targets} />
        <Route path="/jobs" component={Jobs} />
        <Route path="/media" component={Media} />
        <Route path="/posts" component={Posts} />
        <Route path="/embeds" component={Embeds} />
        <Route path="/ads" component={Ads} />
        <Route path="/settings" component={Settings} />
        <Route path="/post-preview" component={PostPreview} />
        <Route path="/downloader" component={Downloader} />
        <Route path="/extractor-profiles" component={ExtractorProfiles} />
        <Route path="/auto-comments" component={AutoComments} />
        <Route path="/mass-grab-schedules" component={MassGrabSchedules} />
        <Route path="/warm-accounts" component={WarmAccounts} />
        <Route path="/background-jobs" component={BackgroundJobs} />
        <Route path="/affiliate-links" component={AffiliateLinks} />
        <Route path="/update" component={UpdatePage} />
        <Route component={NotFound} />
      </Switch>
    </AppLayout>
  );
}

function AppRoutes() {
  const { user, isLoading } = useAuth();

  return (
    <Switch>
      {/* Public routes */}
      <Route path="/" component={Landing} />
      <Route path="/login" component={Login} />
      <Route path="/register" component={Register} />
      <Route path="/checkout">
        {() => <ProtectedRoute component={Checkout} />}
      </Route>

      {/* Admin routes - specific paths first */}
      <Route path="/admin/users">
        {() => <ProtectedRoute component={AdminUsers} adminOnly />}
      </Route>
      <Route path="/admin/pricing">
        {() => <ProtectedRoute component={AdminPricing} adminOnly />}
      </Route>
      <Route path="/admin/payments">
        {() => <ProtectedRoute component={AdminPayments} adminOnly />}
      </Route>
      <Route path="/admin/transactions">
        {() => <ProtectedRoute component={AdminTransactions} adminOnly />}
      </Route>
      <Route path="/admin/affiliate-links">
        {() => <ProtectedRoute component={AdminAffiliateLinks} adminOnly />}
      </Route>
      <Route path="/admin">
        {() => <ProtectedRoute component={AdminDashboard} adminOnly />}
      </Route>

      {/* Protected dashboard routes */}
      <Route path="/dashboard">
        {() => <ProtectedRoute component={() => <DashboardRouter />} />}
      </Route>
      <Route>
        {() => {
          if (isLoading) return <div className="flex items-center justify-center min-h-screen"><div className="text-muted-foreground">Loading...</div></div>;
          if (!user) return <Redirect to="/login" />;
          return <DashboardRouter />;
        }}
      </Route>
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <AuthProvider>
              <AppRoutes />
            </AuthProvider>
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
