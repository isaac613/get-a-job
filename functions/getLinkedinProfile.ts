import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { accessToken } = await base44.asServiceRole.connectors.getConnection("linkedin");

    // Use OpenID Connect userinfo endpoint — works with openid + profile + email scopes
    const res = await fetch("https://api.linkedin.com/v2/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      const err = await res.text();
      return Response.json({ error: `LinkedIn API error: ${err}` }, { status: res.status });
    }

    const data = await res.json();

    return Response.json({
      full_name: data.name || `${data.given_name || ""} ${data.family_name || ""}`.trim(),
      email: data.email || "",
      picture: data.picture || null,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});