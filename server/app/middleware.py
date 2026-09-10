"""Bound request bodies and per-process traffic before expensive work starts.

Buckets are keyed on the ASGI client address. Behind a reverse proxy (Railway,
Tailscale Funnel, nginx) that address is the proxy itself unless uvicorn is
started with proxy headers enabled: see FORWARDED_ALLOW_IPS in run.py.
"""
import time
from collections import OrderedDict, deque
from starlette.responses import JSONResponse

class TrafficLimits:
    def __init__(self, app, max_body=1_048_576):
        self.app, self.max_body = app, max_body
        self.buckets = OrderedDict()

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        path = scope["path"]
        group = "auth" if path.startswith("/api/auth/") and scope["method"] == "POST" else "analysis" if path.startswith(("/api/draft/", "/api/personal/", "/api/pool/")) else None
        if group:
            now = time.monotonic()
            key = ((scope.get("client") or ("unknown",))[0], group)
            bucket = self.buckets.setdefault(key, deque())
            self.buckets.move_to_end(key)
            while bucket and now - bucket[0] >= 60:
                bucket.popleft()
            limit = 15 if group == "auth" else 60
            if len(bucket) >= limit:
                return await JSONResponse({"detail": "Trop de requêtes. Réessaie dans une minute."}, 429, headers={"Retry-After": "60"})(scope, receive, send)
            bucket.append(now)
            while len(self.buckets) > 10000:
                self.buckets.popitem(last=False)
        if scope["method"] in {"POST", "PUT", "PATCH"}:
            declared = next((v for k, v in scope.get("headers", []) if k == b"content-length"), None)
            if declared is not None and declared.isdigit() and int(declared) > self.max_body:
                return await JSONResponse({"detail": "Requête trop volumineuse"}, 413)(scope, receive, send)
            chunks, size = [], 0
            while True:
                message = await receive()
                if message["type"] == "http.disconnect":
                    return
                body = message.get("body", b"")
                size += len(body)
                if size > self.max_body:
                    return await JSONResponse({"detail": "Requête trop volumineuse"}, 413)(scope, receive, send)
                chunks.append(body)
                if not message.get("more_body", False):
                    break
            delivered = False
            async def buffered_receive():
                nonlocal delivered
                if not delivered:
                    delivered = True
                    return {"type": "http.request", "body": b"".join(chunks), "more_body": False}
                return await receive()
            return await self.app(scope, buffered_receive, send)
        await self.app(scope, receive, send)
