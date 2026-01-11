// netlify/functions/concierge.js

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: "Method Not Allowed" };
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "Missing OPENAI_API_KEY in Netlify env vars" }),
      };
    }

    let payload = {};
    try {
      payload = JSON.parse(event.body || "{}");
    } catch (e) {
      return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON body" }) };
    }

    const { question, lang = "he", suite, content } = payload;
    const q = (question || "").trim();
    if (!q) return { statusCode: 400, body: JSON.stringify({ error: "Missing question" }) };

    // Build excerpts from guide
    const data = content || {};
    const L = (data && (data[lang] || data.he)) ? (data[lang] || data.he) : null;

    const snippets = [];
    const add = (arr, tag) => (arr || []).forEach((t) => {
      if (typeof t === "string" && t.trim()) snippets.push({ tag, text: t.trim() });
    });

    if (L?.sections) {
      add(L.sections.rules?.content, "rules");
      add(L.sections.info?.content, "info");
      add(L.sections.useful?.content, "useful");

      if (suite === "313") add(L.sections.arrival?.suite313, "arrival-313");
      else if (suite === "413") add(L.sections.arrival?.suite413, "arrival-413");
      else {
        add(L.sections.arrival?.suite313, "arrival-313");
        add(L.sections.arrival?.suite413, "arrival-413");
      }

      // keep these for now
      add(L.sections.appliances?.suite313, "appliances-313");
      add(L.sections.appliances?.suite413, "appliances-413");
    }

    const qn = q.toLowerCase();
    const words = qn.split(/\s+/).filter(Boolean).slice(0, 24);

    const scored = snippets
      .map((s) => {
        const t = s.text.toLowerCase();
        let score = 0;
        for (const w of words) if (w.length >= 2 && t.includes(w)) score += 1;
        if (s.tag.startsWith("info") || s.tag.startsWith("arrival")) score *= 3;
        if (s.tag.startsWith("rules")) score *= 2;
        return { ...s, score };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 18);

    const contextText = scored.length
      ? scored.map((s, i) => `[${i + 1}] (${s.tag}) ${s.text}`).join("\n")
      : "(No relevant excerpts were found in the guide for this question.)";

    const isHebrew = lang === "he";

    const system = isHebrew
      ? `את/ה Blue, הקונסיארג' הדיגיטלי של Out of the Blue.
ענה/י אך ורק על סמך קטעי המדריך שסופקו. אסור להמציא או לנחש.
אם המידע לא נמצא בקטעים — אמור/י שאין מידע במדריך והצע/י ליצור קשר עם המארחים.
תשובה קצרה ומעשית.`
      : `You are Blue, the digital concierge for Out of the Blue.
Answer ONLY using the provided guide excerpts. Do not invent or guess.
If the information is not present, say so and suggest contacting the hosts.
Keep the answer short and practical.`;

    const user = isHebrew
      ? `שאלת האורח/ת: ${q}

קטעי המדריך (המקור היחיד למידע):
${contextText}`
      : `Guest question: ${q}

Guide excerpts (your only source of truth):
${contextText}`;

    // Call OpenAI (Chat Completions)
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.2,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });

    const raw = await resp.text();
    if (!resp.ok) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "OpenAI request failed", status: resp.status, details: raw }),
      };
    }

    const json = JSON.parse(raw);
    const answer = (json.choices?.[0]?.message?.content || "").trim();

    return {
      statusCode: 200,
      body: JSON.stringify({ answer, debug: { matched: scored.length } }),
    };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: "Server error", details: String(e) }) };
  }
};
