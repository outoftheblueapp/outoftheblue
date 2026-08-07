exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { lang, question, history = [], content } = JSON.parse(event.body || '{}');

    if (!question) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Question is required' })
      };
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'OPENAI_API_KEY is not configured.' })
      };
    }

    const L = content?.[lang] || content?.he || {};
    const guideContext = JSON.stringify(L, null, 2);

    const systemInstruction = `
You are Blue, a warm, helpful, and natural digital AI concierge for the "Out of the Blue" vacation suite in Nahariya, Israel.

CONVERSATION & MEMORY RULES:
1. CONVERSATION CONTEXT:
   - Always track the ongoing conversation context. When a guest asks follow-up questions like "How do I get there?", "Is it open?", or "What about a supermarket?", reply specifically about the venue or topic discussed in the immediate prior messages.

2. SPECIFIC EXTERNAL PLACES & LOCAL VENUES:
   - When a guest asks about a specific real-world venue, business, attraction, or supermarket (e.g., Feisal / שוק פייסל, Big Regba, specific local restaurants, etc.):
     a) Answer accurately using your general local knowledge about THAT specific venue.
     b) NEVER substitute or force a property guide alternative (e.g., Hof HaDekel) unless the guest explicitly asks for "the closest alternative" or "something nearby in the guide."
     c) NEVER output directions to the suite itself when asked how to get to an external business or landmark.

3. PROPERTY GUIDE CONTEXT:
   - Use the PROPERTY GUIDE CONTEXT primarily for property-specific rules, check-in, checkout, Wi-Fi, pool access, and suite amenities.

4. LANGUAGE & TONE:
   - Respond warmly and conversationally like a local host.
   - Always reply in the user's primary language (${lang === 'he' ? 'Hebrew' : 'English'}).

PROPERTY GUIDE CONTEXT:
${guideContext}
`;

    // Map conversation history into OpenAI message format
    const formattedHistory = history.map((msg) => ({
      role: msg.sender === 'user' || msg.role === 'user' ? 'user' : 'assistant',
      content: msg.text || msg.content || ''
    }));

    // Combine system prompt, history, and new user question
    const messages = [
      { role: 'system', content: systemInstruction },
      ...formattedHistory,
      { role: 'user', content: question }
    ];

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: messages,
        temperature: 0.5
      })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('OpenAI API Error:', data);
      throw new Error(data.error?.message || 'API request failed');
    }

    const answer = data.choices?.[0]?.message?.content || '';

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answer })
    };
  } catch (error) {
    console.error('Concierge Error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to process request.' })
    };
  }
};
