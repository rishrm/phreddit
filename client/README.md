# Phreddit Client

React/Vite frontend for Phreddit.

## Scripts

```bash
npm run dev
npm run build
npm run preview
npm run lint
npm run test:unit
npm run test:e2e
```

The client expects the API server to run on port `8000` by default. Vite proxies
`/api` and `/socket.io` in development; production REST calls remain same-origin
through Vercel while `VITE_SOCKET_URL` points realtime traffic at Render.
