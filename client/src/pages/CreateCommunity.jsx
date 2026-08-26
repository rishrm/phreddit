import { useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import { api } from "../api/client.js";

export default function CreateCommunity() {
  const { user, showMessage, refreshCurrentUser } = useOutletContext();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: "",
    description: ""
  });
  const [submitting, setSubmitting] = useState(false);

  if (!user) {
    return (
      <main className="card form-page">
        <h1>New Community</h1>
        <p>You must be logged in to create communities.</p>
        <button onClick={() => navigate("/home")}>Back Home</button>
      </main>
    );
  }

  async function submit(event) {
    event.preventDefault();
    try {
      setSubmitting(true);
      const data = await api.createCommunity(form);
      await refreshCurrentUser();
      showMessage("Community created successfully.", "success");
      const newId = data.community?._id;
      navigate(newId ? `/communities/${newId}` : "/home");
    } catch (error) {
      showMessage(error.message, "error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="card form-page" aria-label="New Community Page">
      <h1>New Community</h1>
      <form onSubmit={submit}>
        <label htmlFor="communityName">Community name*</label>
        <input
          id="communityName"
          placeholder="Community name"
          required
          maxLength={100}
          value={form.name}
          onChange={(event) => setForm({ ...form, name: event.target.value })}
        />
        <label htmlFor="communityDescription">Description*</label>
        <textarea
          id="communityDescription"
          placeholder="Community description"
          required
          maxLength={500}
          value={form.description}
          onChange={(event) => setForm({ ...form, description: event.target.value })}
        />
        <div className="action-row">
          <button className="primary" type="submit" disabled={submitting}>
            {submitting ? "Creating..." : "Submit"}
          </button>
          <button type="button" onClick={() => navigate("/home")}>Cancel</button>
        </div>
      </form>
    </main>
  );
}
