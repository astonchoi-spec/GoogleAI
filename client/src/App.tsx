import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Suspense, lazy } from "react"; // MODIFIED: split route bundles to reduce initial client payload.
import { Route, Switch, useLocation } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Navbar from "./components/Navbar";
import GlobalToastBridge from "./components/GlobalToastBridge"; // MODIFIED: centralize toast notifications for query/mutation errors.

const Home = lazy(() => import("./pages/Home")); // MODIFIED: code-split the landing page bundle.
const Chat = lazy(() => import("./pages/Chat")); // MODIFIED: code-split the chat page bundle.
const Login = lazy(() => import("./pages/Login")); // MODIFIED: code-split the login page bundle.
const Google = lazy(() => import("./pages/Google")); // MODIFIED: code-split the Google Workspace bundle.
const Settings = lazy(() => import("./pages/Settings")); // MODIFIED: code-split the settings page bundle.
const TradingPage = lazy(() => import("./pages/TradingPage")); // MODIFIED: code-split the trading page bundle.
const RealEstatePage = lazy(() => import("./pages/RealEstatePage")); // MODIFIED: code-split the real estate PF bundle.
const Monitoring = lazy(() => import("./pages/Monitoring")); // MODIFIED: code-split the monitoring dashboard bundle.

function Router() {
  const [location] = useLocation();
  const showNav = location !== "/";

  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-950 text-slate-200 flex items-center justify-center">
          Loading...
        </div>
      }
    >
      <>
        {showNav && <Navbar />}
        <Switch>
          <Route path={"/"} component={Home} />
          <Route path={"/chat"} component={Chat} />
          <Route path={"/trading"} component={TradingPage} /> {/* MODIFIED: route for the new trading tab. */}
          <Route path={"/real-estate-pf"} component={RealEstatePage} /> {/* MODIFIED: route for the new real estate PF tab. */}
          <Route path={"/google"} component={Google} />
          <Route path={"/settings"} component={Settings} />
          <Route path={"/monitoring"} component={Monitoring} /> {/* MODIFIED: expose analytics dashboard route. */}
          <Route path={"/login"} component={Login} />
          <Route path={"/404"} component={NotFound} />
          <Route component={NotFound} />
        </Switch>
      </>
    </Suspense>
  );
}

// NOTE: About Theme
// - First choose a default theme according to your design style (dark or light bg), than change color palette in index.css
//   to keep consistent foreground/background color across components
// - If you want to make theme switchable, pass `switchable` ThemeProvider and use `useTheme` hook

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider
        defaultTheme="dark"
        switchable
      >
        <TooltipProvider>
          <Toaster />
          <GlobalToastBridge /> {/* MODIFIED: enable app-wide error toast notifications with de-duplication. */}
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
