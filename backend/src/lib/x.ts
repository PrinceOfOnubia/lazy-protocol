export function extractPostId(url: string) {
  const match = String(url || "").match(/(?:x\.com|twitter\.com)\/[^/]+\/status\/(\d+)/i);
  return match?.[1] || null;
}

export async function fetchXUserFromCode(code: string, verifier: string) {
  if (!process.env.X_CLIENT_ID || !process.env.X_CLIENT_SECRET || !process.env.X_CALLBACK_URL) {
    throw new Error("X OAuth is not configured. Set X_CLIENT_ID, X_CLIENT_SECRET, and X_CALLBACK_URL.");
  }

  const body = new URLSearchParams({
    code,
    grant_type: "authorization_code",
    client_id: process.env.X_CLIENT_ID,
    redirect_uri: process.env.X_CALLBACK_URL,
    code_verifier: verifier,
  });
  const basic = Buffer.from(`${process.env.X_CLIENT_ID}:${process.env.X_CLIENT_SECRET}`).toString("base64");
  const tokenResponse = await fetch("https://api.x.com/2/oauth2/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", authorization: `Basic ${basic}` },
    body,
  });
  if (!tokenResponse.ok) throw new Error("X OAuth token exchange failed.");

  const token = await tokenResponse.json() as { access_token: string };
  const userResponse = await fetch("https://api.x.com/2/users/me?user.fields=profile_image_url,name,username", {
    headers: { authorization: `Bearer ${token.access_token}` },
  });
  if (!userResponse.ok) throw new Error("X user lookup failed.");
  const user = await userResponse.json() as { data: { id: string; username: string; name?: string; profile_image_url?: string } };
  return user.data;
}

export async function fetchPostAuthor(postId: string) {
  if (!process.env.X_BEARER_TOKEN) {
    throw new Error("X_BEARER_TOKEN is not configured. X post ownership cannot be verified.");
  }

  const response = await fetch(`https://api.x.com/2/tweets/${postId}?tweet.fields=author_id,text&expansions=author_id&user.fields=username`, {
    headers: { authorization: `Bearer ${process.env.X_BEARER_TOKEN}` },
  });
  if (!response.ok) throw new Error("Unable to verify X post ownership.");
  const payload = await response.json() as {
    data?: { author_id?: string; text?: string };
    includes?: { users?: Array<{ id: string; username: string }> };
  };

  return {
    authorId: payload.data?.author_id || "",
    handle: payload.includes?.users?.[0]?.username || "",
    text: payload.data?.text || "",
  };
}
