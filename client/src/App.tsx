import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, useLocation } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import Chat from "./pages/Chat";
import Login from "./pages/Login";
import Google from "./pages/Google";
import TradingPage from "./pages/TradingPage"; // MODIFIED: add route target for the new trading tab.
import RealEstatePage from "./pages/RealEstatePage"; // MODIFIED: add route target for the new real estate PF tab.
import Navbar from "./components/Navbar";

function Router() {
  const [location] = useLocation();
  const showNav = location !== "/";

  return (
    <>
      {showNav && <Navbar />}
      <Switch>
        <Route path={"/"} component={Home} />
        <Route path={"/chat"} component={Chat} />
        <Route path={"/trading"} component={TradingPage} /> {/* MODIFIED: route for the new trading tab. */}
        <Route path={"/real-estate-pf"} component={RealEstatePage} /> {/* MODIFIED: route for the new real estate PF tab. */}
        <Route path={"/google"} component={Google} />
        <Route path={"/login"} component={Login} />
        <Route path={"/404"} component={NotFound} />
        <Route component={NotFound} />
      </Switch>
    </>
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
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
