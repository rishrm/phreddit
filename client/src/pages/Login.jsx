import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client.js";

export default function Login({ setUser, showMessage }) {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    email: "",
    password: ""
  });
  const [submitting, setSubmitting] = useState(false);

  async function submit(event) {
    event.preventDefault();
    try {
      setSubmitting(true);
      const data = await api.login(form);
      setUser(data.user);
      showMessage("Logged in successfully.", "success");
      navigate("/home");
    } catch (error) {
      showMessage(error.message, "error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="card auth-card" aria-label="Login Page">
      <h1>Login</h1>
      <p className="page-subtitle">Pick up where you left off.</p>
      <form onSubmit={submit}>
        <label htmlFor="loginEmail">Email</label>
        <input
          id="loginEmail"
          placeholder="Email"
          type="email"
          required
          maxLength={254}
          value={form.email}
          onChange={(event) => setForm({ ...form, email: event.target.value })}
        />
        <label htmlFor="loginPassword">Password</label>
        <input
          id="loginPassword"
          placeholder="Password"
          type="password"
          required
          maxLength={128}
          value={form.password}
          onChange={(event) => setForm({ ...form, password: event.target.value })}
        />
        <div className="action-row">
          <button className="primary" type="submit" disabled={submitting}>
            {submitting ? "Logging in..." : "Login"}
          </button>
          <button type="button" onClick={() => navigate("/")}>Back</button>
        </div>
      </form>
    </main>
  );
}
