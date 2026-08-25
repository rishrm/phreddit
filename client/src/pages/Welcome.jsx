import { ArrowRight, LogIn, MessageCircle, UserRoundPlus } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function Welcome() {
  const navigate = useNavigate();

  return (
    <main className="welcome-screen" aria-label="Welcome Page">
      <section className="welcome-panel">
        <span className="welcome-mark" aria-hidden="true"><MessageCircle size={34} /></span>
        <h1>Welcome to Phreddit</h1>
        <p>Find a community, follow the conversation, and make your voice count.</p>
        <div className="welcome-actions">
          <button className="primary" onClick={() => navigate("/register")}>
            <UserRoundPlus size={18} aria-hidden="true" /> Register
          </button>
          <button onClick={() => navigate("/login")}>
            <LogIn size={18} aria-hidden="true" /> Login
          </button>
          <button className="guest-button" onClick={() => navigate("/home")}>
            Continue as Guest <ArrowRight size={18} aria-hidden="true" />
          </button>
        </div>
      </section>
    </main>
  );
}
