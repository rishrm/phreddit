// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AppErrorBoundary from "./AppErrorBoundary.jsx";

function BrokenView() {
  throw new Error("Render failed");
}

describe("AppErrorBoundary", () => {
  function preventExpectedError(event) {
    event.preventDefault();
  }

  beforeEach(() => {
    window.addEventListener("error", preventExpectedError);
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    window.removeEventListener("error", preventExpectedError);
    cleanup();
    vi.restoreAllMocks();
  });

  it("replaces a crashed render with a recoverable full-page state", () => {
    render(
      <AppErrorBoundary>
        <BrokenView />
      </AppErrorBoundary>
    );

    expect(screen.getByRole("heading", { name: "Something went wrong" }))
      .toBeTruthy();
    expect(screen.getByRole("link", { name: "Reload Phreddit" }).getAttribute("href"))
      .toBe("/home");
  });
});
