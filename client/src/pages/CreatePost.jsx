import { useCallback, useEffect, useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import { api } from "../api/client.js";

export default function CreatePost() {
  const { user, showMessage, refreshData } = useOutletContext();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    community: "",
    title: "",
    content: "",
    linkFlair: "",
    newFlair: ""
  });
  const [communities, setCommunities] = useState([]);
  const [flairs, setFlairs] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [loadError, setLoadError] = useState("");

  const loadOptions = useCallback(async (signal) => {
    try {
      setLoadingOptions(true);
      setLoadError("");
      const [communityData, flairData] = await Promise.all([
        api.getCommunities({ signal }),
        api.getLinkFlairs({ signal }).catch((error) => {
          if (error.name === "AbortError") throw error;
          return { linkFlairs: [] };
        })
      ]);
      const list = communityData.communities || [];
      setCommunities(list);
      if (list.length > 0) {
        setForm((current) => ({ ...current, community: current.community || list[0]._id }));
      }
      const flairList = Array.isArray(flairData?.linkFlairs)
        ? flairData.linkFlairs
        : Array.isArray(flairData)
          ? flairData
          : [];
      setFlairs(flairList);
    } catch (error) {
      if (error.name === "AbortError") return;
      setLoadError(error.message);
      showMessage(error.message, "error");
    } finally {
      if (!signal?.aborted) setLoadingOptions(false);
    }
  }, [showMessage]);

  useEffect(() => {
    const controller = new AbortController();
    void loadOptions(controller.signal);
    return () => controller.abort();
  }, [loadOptions]);

  if (!user) {
    return (
      <main className="card">
        <h1>Create Post</h1>
        <p>You must be logged in to create posts.</p>
        <button onClick={() => navigate("/home")}>Back Home</button>
      </main>
    );
  }

  async function submit(event) {
    event.preventDefault();

    if (!form.community) {
      showMessage("Choose a community before creating a post.", "error");
      return;
    }
    if (!form.title.trim() || form.title.length > 100) {
      showMessage("Title is required and must be 100 characters or less.", "error");
      return;
    }
    if (!form.content.trim()) {
      showMessage("Content is required.", "error");
      return;
    }
    if (form.content.length > 20000) {
      showMessage("Content must be 20,000 characters or less.", "error");
      return;
    }
    if (form.newFlair && form.newFlair.length > 30) {
      showMessage("New link flair must be 30 characters or less.", "error");
      return;
    }

    try {
      setSubmitting(true);
      await api.createPost({
        community: form.community,
        title: form.title.trim(),
        content: form.content.trim(),
        linkFlair: form.linkFlair || null,
        ...(form.newFlair.trim() ? { newFlair: form.newFlair.trim() } : {})
      });
      refreshData();
      showMessage("Post created successfully.", "success");
      navigate("/home");
    } catch (error) {
      showMessage(error.message, "error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="card" aria-label="Create Post Page">
      <h1>Create Post</h1>
      {loadError && (
        <p className="error-state" role="alert">
          {loadError}{" "}
          <button type="button" onClick={() => loadOptions()}>Retry</button>
        </p>
      )}
      <form onSubmit={submit}>
        <label htmlFor="postCommunity">Community*</label>
        <select
          id="postCommunity"
          value={form.community}
          onChange={(event) => setForm({ ...form, community: event.target.value })}
          disabled={loadingOptions || communities.length === 0}
        >
          {communities.length === 0 && <option value="">No communities available</option>}
          {communities.map((community) => (
            <option key={community._id} value={community._id}>
              {community.name}
            </option>
          ))}
        </select>

        <label htmlFor="postTitle">Title* (max 100 chars)</label>
        <input
          id="postTitle"
          placeholder="Post title"
          maxLength={100}
          required
          value={form.title}
          onChange={(event) => setForm({ ...form, title: event.target.value })}
        />

        <label htmlFor="postFlair">Link flair (optional)</label>
        <select
          id="postFlair"
          value={form.linkFlair}
          onChange={(event) => setForm({ ...form, linkFlair: event.target.value })}
        >
          <option value="">No flair</option>
          {flairs.map((flair) => (
            <option key={flair._id} value={flair._id}>
              {flair.content}
            </option>
          ))}
        </select>

        <label htmlFor="postNewFlair">Or new flair (max 30 chars)</label>
        <input
          id="postNewFlair"
          placeholder="New flair text"
          maxLength={30}
          value={form.newFlair}
          onChange={(event) => setForm({ ...form, newFlair: event.target.value })}
        />

        <label htmlFor="postContent">Content* (Markdown supported)</label>
        <textarea
          id="postContent"
          placeholder="Post content"
          maxLength={20000}
          required
          value={form.content}
          onChange={(event) => setForm({ ...form, content: event.target.value })}
        />
        <div className="action-row">
          <button
            type="submit"
            disabled={loadingOptions || communities.length === 0 || submitting}
          >
            {submitting ? "Publishing..." : "Submit"}
          </button>
          <button type="button" onClick={() => navigate("/home")}>Cancel</button>
        </div>
      </form>
    </main>
  );
}
