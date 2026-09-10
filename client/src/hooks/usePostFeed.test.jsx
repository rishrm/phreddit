// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { api } from "../api/client.js";
import usePostFeed from "./usePostFeed.js";

vi.mock("../api/client.js", () => ({ api: { getPosts: vi.fn() } }));
afterEach(() => { cleanup(); vi.resetAllMocks(); });

it("appends cursor pages, retains the initial count, and suppresses repeated cards", async () => {
  api.getPosts.mockResolvedValueOnce({ posts: [{ _id: "a" }], total: 2, nextCursor: "next" })
    .mockResolvedValueOnce({ posts: [{ _id: "a" }, { _id: "b" }], nextCursor: null });
  const { result } = renderHook(() => usePostFeed({ sort: "newest" }));
  await waitFor(() => expect(result.current.loading).toBe(false));
  act(() => result.current.loadMore());
  await waitFor(() => expect(result.current.posts).toHaveLength(2));
  expect(api.getPosts.mock.calls[1][0].cursor).toBe("next");
  expect(result.current.total).toBe(2);
  expect(result.current.nextCursor).toBeNull();
});

it("aborts an old continuation on a sort change and on unmount", async () => {
  let finishOldRequest;
  api.getPosts.mockResolvedValueOnce({ posts: [{ _id: "a" }], total: 2, nextCursor: "next" })
    .mockImplementationOnce(() => new Promise((resolve) => { finishOldRequest = resolve; }))
    .mockResolvedValueOnce({ posts: [{ _id: "oldest" }], total: 2, nextCursor: "old-next" })
    .mockReturnValueOnce(new Promise(() => {}));
  const { result, rerender, unmount } = renderHook(
    ({ sort }) => usePostFeed({ sort }), { initialProps: { sort: "newest" } }
  );
  await waitFor(() => expect(result.current.loading).toBe(false));
  act(() => result.current.loadMore());
  const oldSignal = api.getPosts.mock.calls[1][1].signal;
  rerender({ sort: "oldest" });
  await waitFor(() => expect(result.current.posts[0]?._id).toBe("oldest"));
  expect(oldSignal.aborted).toBe(true);
  await act(async () => finishOldRequest({ posts: [{ _id: "stale" }] }));
  expect(result.current.posts.map((post) => post._id)).toEqual(["oldest"]);
  act(() => result.current.loadMore());
  const finalSignal = api.getPosts.mock.calls[3][1].signal;
  unmount();
  expect(finalSignal.aborted).toBe(true);
});

it("recovers from changed membership with a fresh request and clears disabled searches", async () => {
  api.getPosts.mockResolvedValueOnce({ posts: [{ _id: "a" }], total: 2, nextCursor: "next" })
    .mockRejectedValueOnce(Object.assign(new Error("Invalid cursor"), { code: "INVALID_POST_CURSOR" }))
    .mockResolvedValueOnce({ posts: [{ _id: "b" }], total: 1, nextCursor: null });
  const { result, rerender } = renderHook(
    ({ enabled }) => usePostFeed({ sort: "active", search: "test", enabled }),
    { initialProps: { enabled: true } }
  );
  await waitFor(() => expect(result.current.loading).toBe(false));
  act(() => result.current.loadMore());
  await waitFor(() => expect(result.current.error).toMatch(/feed has changed/));
  expect(result.current.nextCursor).toBeNull();
  await act(async () => result.current.retry());
  expect(api.getPosts.mock.calls[2][0].cursor).toBeUndefined();
  expect(result.current.posts).toEqual([{ _id: "b" }]);
  expect(result.current.error).toBe("");
  rerender({ enabled: false });
  expect(result.current.posts).toEqual([]);
  expect(result.current.total).toBe(0);
  expect(api.getPosts).toHaveBeenCalledTimes(3);
});
