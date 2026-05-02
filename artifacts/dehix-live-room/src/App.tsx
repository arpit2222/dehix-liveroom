import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/context/AuthContext";
import NotFound from "@/pages/not-found";
import Landing from "@/pages/Landing";
import Login from "@/pages/Login";
import Register from "@/pages/Register";
import CreateRoom from "@/pages/CreateRoom";
import LiveRoom from "@/pages/LiveRoom";
import TalentDashboard from "@/pages/TalentDashboard";
import TalentProfile from "@/pages/TalentProfile";
import BusinessDashboard from "@/pages/BusinessDashboard";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
});

function Router() {
  return (
    <Switch>
      <Route path="/" component={Landing} />
      <Route path="/login" component={Login} />
      <Route path="/register" component={Register} />
      <Route path="/room/create" component={CreateRoom} />
      <Route path="/room/:id" component={LiveRoom} />
      <Route path="/talent/dashboard" component={TalentDashboard} />
      <Route path="/talent/profile/:id" component={TalentProfile} />
      <Route path="/business/dashboard" component={BusinessDashboard} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
