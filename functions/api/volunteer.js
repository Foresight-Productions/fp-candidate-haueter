import { EmailMessage } from "cloudflare:email";

const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]));

const buildMime = ({ from, to, subject, text, html }) => {
  const boundary = "tfy-" + Math.random().toString(36).slice(2);
  const headers = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ].join("\r\n");
  const body = [
    `--${boundary}`,
    `Content-Type: text/plain; charset="utf-8"`,
    `Content-Transfer-Encoding: 7bit`,
    ``,
    text,
    `--${boundary}`,
    `Content-Type: text/html; charset="utf-8"`,
    `Content-Transfer-Encoding: 7bit`,
    ``,
    html,
    `--${boundary}--`,
    ``,
  ].join("\r\n");
  return `${headers}\r\n\r\n${body}`;
};

export async function onRequestPost(context) {
  const { request, env } = context;

  let data;
  const ctype = request.headers.get("content-type") || "";
  try {
    if (ctype.includes("application/json")) {
      data = await request.json();
    } else {
      const fd = await request.formData();
      data = {
        name: fd.get("name") || "",
        email: fd.get("email") || "",
        phone: fd.get("phone") || "",
        interests: fd.getAll("interest"),
        website: fd.get("website") || "", // honeypot
      };
    }
  } catch (e) {
    return new Response("Bad request", { status: 400 });
  }

  // Honeypot check — if the hidden "website" field is filled, silently succeed
  if (data.website) {
    return Response.redirect("https://tylerforyakima.com/thanks.html", 303);
  }

  const name = (data.name || "").trim().slice(0, 200);
  const email = (data.email || "").trim().slice(0, 200);
  const phone = (data.phone || "").trim().slice(0, 50);
  const interests = (Array.isArray(data.interests) ? data.interests : [data.interests])
    .filter(Boolean)
    .map((s) => String(s).slice(0, 50));

  if (!name || !email) {
    return new Response("Name and email are required.", { status: 400 });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return new Response("Invalid email address.", { status: 400 });
  }

  const interestsStr = interests.length ? interests.join(", ") : "(none selected)";

  const text = [
    "New volunteer signup — TylerForYakima.com",
    "",
    `Name:      ${name}`,
    `Email:     ${email}`,
    `Phone:     ${phone || "(not provided)"}`,
    `Interests: ${interestsStr}`,
    "",
    `Submitted: ${new Date().toISOString()}`,
    `IP:        ${request.headers.get("CF-Connecting-IP") || "unknown"}`,
  ].join("\n");

  const html = `
<!DOCTYPE html>
<html><body style="font-family:-apple-system,Segoe UI,sans-serif;color:#1a1a1a;line-height:1.5">
  <h2 style="color:#A8100D;margin:0 0 .6em">New volunteer signup</h2>
  <p style="color:#666;margin:0 0 1.4em">Submitted via TylerForYakima.com</p>
  <table cellpadding="6" style="border-collapse:collapse;font-size:15px">
    <tr><td style="font-weight:700;border-bottom:1px solid #eee">Name</td><td style="border-bottom:1px solid #eee">${escapeHtml(name)}</td></tr>
    <tr><td style="font-weight:700;border-bottom:1px solid #eee">Email</td><td style="border-bottom:1px solid #eee"><a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a></td></tr>
    <tr><td style="font-weight:700;border-bottom:1px solid #eee">Phone</td><td style="border-bottom:1px solid #eee">${escapeHtml(phone || "(not provided)")}</td></tr>
    <tr><td style="font-weight:700;border-bottom:1px solid #eee">Interests</td><td style="border-bottom:1px solid #eee">${escapeHtml(interestsStr)}</td></tr>
  </table>
  <p style="color:#999;font-size:12px;margin-top:1.6em">Submitted ${new Date().toUTCString()} from ${escapeHtml(request.headers.get("CF-Connecting-IP") || "unknown")}</p>
</body></html>`.trim();

  const FROM = "noreply@tylerforyakima.com";
  const TO = "info@media4sight.net";

  const raw = buildMime({
    from: `TylerForYakima Volunteer Form <${FROM}>`,
    to: TO,
    subject: `New volunteer signup — ${name}`,
    text,
    html,
  });

  try {
    const message = new EmailMessage(FROM, TO, raw);
    await env.SEND_EMAIL.send(message);
  } catch (e) {
    console.error("send_email failed:", e);
    return new Response("Could not send email: " + e.message, { status: 500 });
  }

  // If submitted via JSON (fetch), return JSON; otherwise redirect like a normal form post
  if (ctype.includes("application/json")) {
    return new Response(JSON.stringify({ ok: true }), {
      headers: { "content-type": "application/json" },
    });
  }
  return Response.redirect("https://tylerforyakima.com/thanks.html", 303);
}
