// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "../api/client.js";
import CreatePost from "./CreatePost.jsx";

const navigate = vi.fn();
const showMessage = vi.fn();
const refreshData = vi.fn();

vi.mock("../api/client.js", () => ({
  api: {
    getCommunities: vi.fn(),
    getLinkFlairs: vi.fn(),
    createPost: vi.fn()
  }
}));

vi.mock("react-router-dom", () => ({
  useNavigate: () => navigate,
  useOutletContext: () => ({
    user: { _id: "user-1" }, showMessage, refreshData
  })
}));

afterEach(() => vi.clearAllMocks());

describe("CreatePost", () => {
  it("preserves the default community when option loading and typing share a render", async () => {
    let finishOptions;
    api.getCommunities.mockReturnValue(new Promise((resolve) => {
      finishOptions = resolve;
    }));
    api.getLinkFlairs.mockResolvedValue({ linkFlairs: [] });
    api.createPost.mockResolvedValue({ post: { _id: "post-1" } });

    render(<CreatePost />);
    expect(screen.getByRole("button", { name: "Submit" }).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Title* (max 100 chars)"), {
      target: { value: "A useful discussion" }
    });

    await act(async () => {
      finishOptions({ communities: [{ _id: "community-1", name: "Engineering" }] });
      // Queue the async defaults before typing, but keep both in one React batch.
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      fireEvent.change(screen.getByLabelText("Content* (Markdown supported)"), {
        target: { value: "A draft written while the options load." }
      });
    });

    fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    await waitFor(() => expect(api.createPost).toHaveBeenCalledWith({
      community: "community-1",
      title: "A useful discussion",
      content: "A draft written while the options load.",
      linkFlair: null
    }));
    expect(navigate).toHaveBeenCalledWith("/home");
    expect(refreshData).toHaveBeenCalledOnce();
  });
});
