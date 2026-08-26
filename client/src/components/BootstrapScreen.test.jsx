// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import BootstrapScreen from "./BootstrapScreen.jsx";

describe("BootstrapScreen", () => {
  it("announces the initial connection state", () => {
    render(<BootstrapScreen phase="connecting" onRetry={vi.fn()} />);

    expect(
      screen.getByRole("heading", { name: "Starting Phreddit" })
    ).toBeTruthy();
    expect(screen.getByRole("status").getAttribute("aria-busy")).toBe("true");
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("explains an idle-server cold start", () => {
    render(<BootstrapScreen phase="waking" onRetry={vi.fn()} />);

    expect(
      screen.getByRole("heading", { name: "Waking the demo server" })
    ).toBeTruthy();
    expect(screen.getByText(/first request can take up to a minute/i)).toBeTruthy();
  });

  it("shows a retry action when the connection fails", () => {
    const onRetry = vi.fn();
    render(
      <BootstrapScreen
        phase="error"
        error="The demo server did not respond within a minute."
        onRetry={onRetry}
      />
    );

    expect(screen.getByRole("alert").getAttribute("aria-busy")).toBe("false");
    fireEvent.click(screen.getByRole("button", { name: "Retry connection" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
