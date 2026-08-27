// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import Banner from "./Banner.jsx";

describe("Banner", () => {
  afterEach(cleanup);

  it("shows assignment-required disabled guest controls", () => {
    render(
      <MemoryRouter>
        <Banner user={null} onLogout={vi.fn()} />
      </MemoryRouter>
    );

    expect(screen.getByRole("button", { name: "Guest" }).disabled).toBe(true);
    expect(screen.getByRole("button", { name: "Create Post" }).disabled).toBe(true);
    expect(screen.getByRole("button", { name: "Login" }).disabled).toBe(false);
    expect(screen.getByRole("button", { name: "Register" }).disabled).toBe(false);
  });

  it("enables creation and profile navigation for a signed-in user", () => {
    render(
      <MemoryRouter>
        <Banner user={{ displayName: "rish" }} onLogout={vi.fn()} />
      </MemoryRouter>
    );

    expect(screen.getByRole("button", { name: "Create Post" }).disabled).toBe(false);
    expect(screen.getByRole("button", { name: "rish" }).disabled).toBe(false);
    expect(screen.queryByRole("button", { name: "Login" })).toBeNull();
  });
});
