import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client.js";

export default function Register({ showMessage }) {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    displayName: "",
    password: "",
    confirmPassword: ""
  });
  const [submitting, setSubmitting] = useState(false);

  async function submit(event) {
    event.preventDefault();
    try {
      setSubmitting(true);
      const data = await api.register(form);
      showMessage(data.message, "success");
      navigate("/");
    } catch (error) {
      showMessage(error.message, "error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="card auth-card auth-card--wide" aria-label="Register Page">
      <h1>Sign Up</h1>
      <p className="page-subtitle">Create an account and join the conversation.</p>
      <form onSubmit={submit}>
        <div className="form-two-column">
          <label htmlFor="firstName">First name
            <input
              id="firstName"
              placeholder="First name"
              required
              maxLength={50}
              value={form.firstName}
              onChange={(event) => setForm({ ...form, firstName: event.target.value })}
            />
          </label>
          <label htmlFor="lastName">Last name
            <input
              id="lastName"
              placeholder="Last name"
              required
              maxLength={50}
              value={form.lastName}
              onChange={(event) => setForm({ ...form, lastName: event.target.value })}
            />
          </label>
        </div>
        <label htmlFor="email">Email</label>
        <input
          id="email"
          placeholder="Email"
          type="email"
          required
          maxLength={254}
          value={form.email}
          onChange={(event) => setForm({ ...form, email: event.target.value })}
        />
        <label htmlFor="displayName">Display name</label>
        <input
          id="displayName"
          placeholder="Display name"
          required
          maxLength={50}
          value={form.displayName}
          onChange={(event) => setForm({ ...form, displayName: event.target.value })}
        />
        <div className="form-two-column">
          <label htmlFor="password">Password (min 8 characters)
            <input
              id="password"
              placeholder="Password"
              type="password"
              required
              minLength={8}
              maxLength={128}
              value={form.password}
              onChange={(event) => setForm({ ...form, password: event.target.value })}
            />
          </label>
          <label htmlFor="confirmPassword">Confirm password
            <input
              id="confirmPassword"
              placeholder="Confirm password"
              type="password"
              required
              minLength={8}
              maxLength={128}
              value={form.confirmPassword}
              onChange={(event) => setForm({ ...form, confirmPassword: event.target.value })}
            />
          </label>
        </div>
        <div className="action-row">
          <button className="primary" type="submit" disabled={submitting}>
            {submitting ? "Creating account..." : "Sign Up"}
          </button>
          <button type="button" onClick={() => navigate("/")}>Back</button>
        </div>
      </form>
    </main>
  );
}
