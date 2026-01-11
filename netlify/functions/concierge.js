// netlify/functions/concierge.js
exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: "Method Not Allowed" };
    }

    const { question, lang, suite, content } = JSON.parse(event.body || "{}");
    const q = (question || "").trim();
    if (!q) {
      return { statusCode: 400, body: JSON.stringify({ error: "Missing question" }) };
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return { statusCode: 500, body: JSON.stringify({ error: "Missing OPENAI_API_KEY" }) };
    }

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

      add(L.sections.appliances?.suite313, "appliances-313");
      add(L.sections.appliances?.suite413, "appliances-413");
    }

    const qn = q.toLowerCase();
    const words = qn.split(/\s+/).filter(Boolean).slice(0, 24);

    const scored = snippets.map((s) => {
      const t = s.text.toLowerCase();
      let score = 0;
      for (const w of words) {
        if (w.length >= 2 && t.includes(w)) score += 1;
      }
      if (s.tag.startsWith("info") || s.tag.startsWith("arrival")) score *= 3;
      if (s.tag.startsWith("rules")) score *= 2;
      return { ...s, score };
    }).filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 18);

    const contextText = scored.length
      ? scored.map((s, i) => `[${i + 1}] (${s.tag}) ${s.text}`).join("\n")
      : "(No relevant excerpts were found in the guide.)";

    const isHebrew = (lang === "he");
    const system = isHebrew
      ? `את/ה Blue, הקונסיארג' הדיגיטלי של Out of the Blue.
ענה/י אך ורק על סמך קטעי המדריך שסופקו. אסור להמציא או לנחש.
אם המידע לא נמצא בקטעים — אמור/י שאין מידע במדריך והצע/י ליצור קשר עם המארחים.`
      : `You are Blue, the digital concierge for Out of the Blue.
Answer ONLY using the provided guide excerpts. Do not invent or guess.
If the information is not present, say so and suggest contacting the hosts.`;

    const user = isHebrew
      ? `שאלת האורח/ת: ${q}

קטעי המדריך:
${contextText}`
      : `Guest question: ${q}

Guide excerpts:
${contextText}`;

    const resp = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        input: [
          { role: "system", content: system },
          { role: "user", content: user }
        ],
        temperature: 0.2
      })
    });

    const json = await resp.json();
    const answer =
      json.output_text ||
      json?.output?.[0]?.content?.[0]?.text ||
      "";

    return {
      statusCode: 200,
      body: JSON.stringify({ answer })
    };

  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: String(e) }) };
  }
};
