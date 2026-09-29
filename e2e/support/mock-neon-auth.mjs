// Stand-in for the Neon Auth HTTP API, used only by the Playwright suite so it
// runs offline without real email. The app code is unchanged: tests point
// NEON_AUTH_BASE_URL here instead of at Neon. Never deploy this.
import { createServer } from "node:http";

const PORT = Number(process.env.MOCK_NEON_AUTH_PORT ?? 4010);
const BASE_PATH = "/neondb/auth";
const SESSION_COOKIE = "__Secure-neon-auth.session_token";

// Session tokens the tests can put in the browser, and who they belong to.
const sessions = {
  "approved-admin": { email: "alex@example.com", emailVerified: true },
  "unapproved-user": { email: "guest@example.com", emailVerified: true },
  "unverified-admin": { email: "alex@example.com", emailVerified: false },
};

let magicLinkRequests = [];

function sessionPayload(token, { email, emailVerified }) {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 60 * 60 * 1000);
  return {
    session: {
      id: `session-${token}`,
      token,
      userId: `user-${token}`,
      expiresAt: expiresAt.toISOString(),
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    },
    user: {
      id: `user-${token}`,
      name: "",
      email,
      emailVerified,
      image: null,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    },
  };
}

function readSessionToken(req) {
  const header = req.headers.cookie ?? "";
  for (const part of header.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === SESSION_COOKIE) return rest.join("=");
  }
  return null;
}

async function readJson(req) {
  let raw = "";
  for await (const chunk of req) raw += chunk;
  return raw ? JSON.parse(raw) : null;
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, { "content-type": "application/json", ...headers });
  res.end(JSON.stringify(body));
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
  const route = `${req.method} ${url.pathname}`;

  switch (route) {
    case "GET /__test/health":
      return send(res, 200, { ok: true });
    case "GET /__test/magic-link-requests":
      return send(res, 200, magicLinkRequests);
    case "DELETE /__test/magic-link-requests":
      magicLinkRequests = [];
      return send(res, 200, { ok: true });

    case `GET ${BASE_PATH}/get-session`: {
      const token = readSessionToken(req);
      const user = token ? sessions[token] : undefined;
      return send(res, 200, user ? sessionPayload(token, user) : null);
    }
    case `POST ${BASE_PATH}/sign-in/magic-link`:
      magicLinkRequests.push(await readJson(req));
      return send(res, 200, { status: true });
    case `POST ${BASE_PATH}/sign-out`:
      return send(res, 200, { success: true }, {
        "set-cookie": `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`,
      });

    default:
      return send(res, 404, { message: `mock-neon-auth: no handler for ${route}` });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`mock-neon-auth listening on http://127.0.0.1:${PORT}${BASE_PATH}`);
});
