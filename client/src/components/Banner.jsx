import { useEffect, useState } from "react";
import {
  Home,
  LogIn,
  LogOut,
  MessageCircle,
  Plus,
  Search,
  UserRound,
  UserRoundPlus
} from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";

export default function Banner({ user, onLogout }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [searchValue, setSearchValue] = useState(searchParams.get("q") || "");

  useEffect(() => {
    setSearchValue(searchParams.get("q") || "");
  }, [searchParams]);

  function submitSearch() {
    const query = searchValue.trim();
    if (!query) {
      navigate("/home");
      return;
    }
    navigate(`/search?q=${encodeURIComponent(query)}`);
  }

  function handleSearchKey(event) {
    if (event.key === "Enter") {
      event.preventDefault();
      submitSearch();
    }
  }

  return (
    <header className="banner">
      <button
        className="brand-button"
        onClick={() => navigate(user ? "/home" : "/")}
        aria-label="Phreddit home"
      >
        <span className="brand-mark" aria-hidden="true"><MessageCircle size={19} /></span>
        <span>phreddit</span>
      </button>
      <button className="nav-button banner-home" onClick={() => navigate("/home")}>
        <Home size={17} aria-hidden="true" />
        <span>Home</span>
      </button>
      <div className="search-wrap">
        <Search size={18} aria-hidden="true" />
        <input
          type="search"
          className="banner-search"
          aria-label="Search Phreddit"
          placeholder="Search posts, communities, people, and flairs"
          maxLength={200}
          value={searchValue}
          onChange={(event) => setSearchValue(event.target.value)}
          onKeyDown={handleSearchKey}
        />
      </div>
      <button
        className="primary nav-button banner-create-post"
        disabled={!user}
        title={!user ? "Log in to create a post" : undefined}
        onClick={() => navigate("/posts/new")}
      >
        <Plus size={17} aria-hidden="true" />
        <span>Create Post</span>
      </button>
      <button
        className={`nav-button profile-button${user ? "" : " guest-profile"}`}
        disabled={!user}
        onClick={() => navigate("/profile")}
      >
        <UserRound size={17} aria-hidden="true" />
        <span>{user?.displayName || "Guest"}</span>
      </button>
      {!user && (
        <button className="nav-button" onClick={() => navigate("/login")}>
          <LogIn size={17} aria-hidden="true" />
          <span>Login</span>
        </button>
      )}
      {!user && (
        <button className="primary nav-button banner-register" onClick={() => navigate("/register")}>
          <UserRoundPlus size={17} aria-hidden="true" />
          <span>Register</span>
        </button>
      )}
      {user && (
        <button className="icon-button" onClick={onLogout} aria-label="Logout" title="Logout">
          <LogOut size={18} aria-hidden="true" />
        </button>
      )}
    </header>
  );
}
