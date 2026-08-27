// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import DiscoveryResults from "./DiscoveryResults.jsx";

describe("DiscoveryResults", () => {
  it("links public matches and applies a matching flair", () => {
    const onSelectFlair = vi.fn();
    render(
      <MemoryRouter>
        <DiscoveryResults
          results={{
            communities: [{
              _id: "community-1",
              name: "webdev",
              description: "Frontend discussions",
              memberCount: 1
            }],
            users: [{ _id: "user-1", displayName: "rish", reputation: 100 }],
            linkFlairs: [{ _id: "flair-1", content: "Showcase" }]
          }}
          onSelectFlair={onSelectFlair}
        />
      </MemoryRouter>
    );

    expect(screen.getByRole("link", { name: "webdev" }).getAttribute("href"))
      .toBe("/communities/community-1");
    expect(screen.getByRole("link", { name: "rish" }).getAttribute("href"))
      .toBe("/users/user-1");
    expect(screen.getByText("1 member")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Showcase" }));
    expect(onSelectFlair).toHaveBeenCalledWith("flair-1");
  });

  it("offers an inline retry when discovery fails", () => {
    const onRetry = vi.fn();
    render(
      <DiscoveryResults error="Network unavailable" onRetry={onRetry} />
    );
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
