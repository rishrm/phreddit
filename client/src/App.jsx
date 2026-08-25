import { useCallback, useEffect, useRef, useState } from "react";
import {
  Navigate,
  Outlet,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { api } from "./api/client.js";
import AppShell from "./components/AppShell.jsx";
import Banner from "./components/Banner.jsx";
import BootstrapScreen from "./components/BootstrapScreen.jsx";
import Welcome from "./pages/Welcome.jsx";
import Register from "./pages/Register.jsx";
import Login from "./pages/Login.jsx";
import Home from "./pages/Home.jsx";
import Search from "./pages/Search.jsx";
import CreateCommunity from "./pages/CreateCommunity.jsx";
import CreatePost from "./pages/CreatePost.jsx";
import CreateComment from "./pages/CreateComment.jsx";
import Community from "./pages/Community.jsx";
import Post from "./pages/Post.jsx";
import Profile from "./pages/Profile.jsx";
import UserProfile from "./pages/UserProfile.jsx";
import NotFound from "./pages/NotFound.jsx";

function Layout({
  user,
  communities,
  showMessage,
  refreshCurrentUser,
  refreshData,
  refreshToken,
  onLogout
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const communityMatch = location.pathname.match(/^\/communities\/([^/]+)$/);

  return (
    <>
      <a className="skip-link" href="#main-content">Skip to content</a>
      <div className="top-bar">
        <Banner user={user} onLogout={onLogout} />
      </div>
      <AppShell
        user={user}
        communities={communities}
        selectedCommunityId={communityMatch?.[1] || null}
        onHome={() => navigate("/home")}
        onOpenCommunity={(id) => navigate(`/communities/${id}`)}
        onCreateCommunity={() => navigate("/communities/new")}
        onCreatePost={() => navigate("/posts/new")}
      >
        <Outlet
          context={{
            user,
            communities,
            showMessage,
            refreshCurrentUser,
            refreshData,
            refreshToken
          }}
        />
      </AppShell>
    </>
  );
}

function RouteAnnouncer() {
  const location = useLocation();
  const routeName = location.pathname.startsWith("/posts/")
    ? "Post"
    : location.pathname.startsWith("/communities/")
      ? "Community"
      : location.pathname.startsWith("/users/")
        ? "User profile"
        : location.pathname.startsWith("/profile")
          ? "Profile"
          : location.pathname === "/search"
            ? "Search"
            : location.pathname === "/home"
              ? "Home"
              : "Phreddit";

  useEffect(() => {
    document.title = routeName === "Phreddit" ? "Phreddit" : `${routeName} | Phreddit`;
  }, [routeName]);

  return <p className="sr-only" aria-live="polite">Navigated to {routeName}</p>;
}

export default function App() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [message, setMessage] = useState(null);
  const [refreshToken, setRefreshToken] = useState(0);
  const [communities, setCommunities] = useState([]);
  const [bootstrapState, setBootstrapState] = useState({
    phase: "connecting",
    error: ""
  });
  const bootstrapAbortRef = useRef(null);

  const showMessage = useCallback((text, tone = "info") => {
    setMessage({ text, tone });
  }, []);

  const refreshData = useCallback(() => {
    setRefreshToken((current) => current + 1);
  }, []);

  const refreshCurrentUser = useCallback(async () => {
    try {
      const data = await api.me();
      setUser(data.user);
      refreshData();
      return data.user;
    } catch (error) {
      showMessage(error.message, "error");
      return null;
    }
  }, [refreshData, showMessage]);

  const checkSession = useCallback(async () => {
    bootstrapAbortRef.current?.abort();

    const controller = new AbortController();
    let didTimeout = false;
    bootstrapAbortRef.current = controller;
    setAuthChecked(false);
    setBootstrapState({ phase: "connecting", error: "" });

    const wakingTimer = setTimeout(() => {
      setBootstrapState((current) =>
        current.phase === "connecting"
          ? { phase: "waking", error: "" }
          : current
      );
    }, 3000);

    const timeoutTimer = setTimeout(() => {
      didTimeout = true;
      controller.abort();
    }, 60000);

    try {
      const data = await api.me({ signal: controller.signal });
      setUser(data.user);
      setAuthChecked(true);
      setBootstrapState({ phase: "ready", error: "" });
    } catch {
      if (controller.signal.aborted && !didTimeout) return;

      setBootstrapState({
        phase: "error",
        error: didTimeout
          ? "The demo server did not respond within a minute."
          : "The server could not be reached. Check your connection and try again."
      });
    } finally {
      clearTimeout(wakingTimer);
      clearTimeout(timeoutTimer);
      if (bootstrapAbortRef.current === controller) {
        bootstrapAbortRef.current = null;
      }
    }
  }, []);

  async function logout() {
    try {
      await api.logout();
      setUser(null);
      refreshData();
      showMessage("Logged out successfully.", "success");
      navigate("/");
    } catch (error) {
      showMessage(error.message, "error");
    }
  }

  useEffect(() => {
    void checkSession();
    return () => bootstrapAbortRef.current?.abort();
  }, [checkSession]);

  useEffect(() => {
    if (!authChecked) return;
    const controller = new AbortController();
    api
      .getCommunities({ signal: controller.signal })
      .then((data) => setCommunities(data.communities || []))
      .catch((error) => {
        if (error.name !== "AbortError") showMessage(error.message, "error");
      });
    return () => controller.abort();
  }, [authChecked, refreshToken, user?._id, showMessage]);

  useEffect(() => {
    if (!message) return;
    const id = setTimeout(() => setMessage(null), 4000);
    return () => clearTimeout(id);
  }, [message]);

  if (!authChecked) {
    return (
      <BootstrapScreen
        phase={bootstrapState.phase}
        error={bootstrapState.error}
        onRetry={() => void checkSession()}
      />
    );
  }

  const isError = message?.tone === "error";

  return (
    <>
      <RouteAnnouncer />
      {message && (
        <p
          role={isError ? "alert" : "status"}
          aria-live={isError ? "assertive" : "polite"}
          className={`message message--${message.tone}`}
        >
          {message.text}
        </p>
      )}

      <Routes>
        <Route
          path="/"
          element={user ? <Navigate to="/home" replace /> : <Welcome />}
        />
        <Route
          path="/register"
          element={
            user ? (
              <Navigate to="/home" replace />
            ) : (
              <Register showMessage={showMessage} />
            )
          }
        />
        <Route
          path="/login"
          element={
            user ? (
              <Navigate to="/home" replace />
            ) : (
              <Login setUser={setUser} showMessage={showMessage} />
            )
          }
        />
        <Route
          element={
            <Layout
              user={user}
              communities={communities}
              showMessage={showMessage}
              refreshCurrentUser={refreshCurrentUser}
              refreshData={refreshData}
              refreshToken={refreshToken}
              onLogout={logout}
            />
          }
        >
          <Route path="/home" element={<Home />} />
          <Route path="/search" element={<Search />} />
          <Route path="/communities/new" element={<CreateCommunity />} />
          <Route path="/communities/:communityId" element={<Community />} />
          <Route path="/posts/new" element={<CreatePost />} />
          <Route path="/posts/:postId/comments/new" element={<CreateComment />} />
          <Route path="/posts/:postId" element={<Post />} />
          <Route path="/users/:userId" element={<UserProfile />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/profile/:userId" element={<Profile />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </>
  );
}
