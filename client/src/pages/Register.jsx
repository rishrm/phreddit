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
    <main className="card" aria-label="Register Page">
      <h1>Sign Up</h1>
      <form onSubmit={submit}>
        <label htmlFor="firstName">First name</label>
        <input
          id="firstName"
          placeholder="First name"
          required
          maxLength={50}
          value={form.firstName}
          onChange={(event) => setForm({ ...form, firstName: event.target.value })}
        />
        <label htmlFor="lastName">Last name</label>
        <input
          id="lastName"
          placeholder="Last name"
          required
          maxLength={50}
          value={form.lastName}
          onChange={(event) => setForm({ ...form, lastName: event.target.value })}
        />
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
        <label htmlFor="password">Password (min 8 characters)</label>
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
        <label htmlFor="confirmPassword">Confirm password</label>
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
        <div className="action-row">
          <button type="submit" disabled={submitting}>
            {submitting ? "Creating account..." : "Sign Up"}
          </button>
          <button type="button" onClick={() => navigate("/")}>Back</button>
        </div>
      </form>
    </main>
  );
}
