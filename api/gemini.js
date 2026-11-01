// PageCraft AI proxy (Vercel serverless function).
// The Gemini API key lives ONLY in the Vercel environment variable
// GEMINI_API_KEY. It is never sent to the browser and never appears
// in this file. The page POSTs { prompt } here and receives back
// validated page JSON it can apply to the preview.
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'not_configured' });
    return;
  }
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }
  const prompt = body && typeof body.prompt === 'string' ? body.prompt : '';
  if (!prompt.trim()) {
    res.status(400).json({ error: 'empty_prompt' });
    return;
  }
  const system = 'You are a landing page copy assistant. Reply with ONLY a JSON object, no markdown, no explanation, with these fields: ' +
    'headline (string), sub (string), buttonText (string), color (a hex colour like #111111), ' +
    'features (array of up to 6 objects, each with title and text strings). ' +
    'Keep the copy short, professional and in the same language as the user prompt.';
  try {
    const r = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' + encodeURIComponent(apiKey),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: system + '\n\nUser request:\n' + prompt }] }],
          generationConfig: { temperature: 0.7 }
        })
      }
    );
    const data = await r.json();
    let text = '';
    try {
      text = data.candidates[0].content.parts.map(function (p) { return p.text || ''; }).join('');
    } catch (e) { text = ''; }
    text = text.replace(/```json|```/g, '').trim();
    let out;
    try { out = JSON.parse(text); } catch (e) {
      res.status(502).json({ error: 'bad_ai_response' });
      return;
    }
    const clean = {
      headline: typeof out.headline === 'string' ? out.headline : '',
      sub: typeof out.sub === 'string' ? out.sub : '',
      buttonText: typeof out.buttonText === 'string' ? out.buttonText : '',
      color: typeof out.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(out.color) ? out.color : '#111111',
      features: Array.isArray(out.features) ? out.features.filter(function (f) {
        return f && typeof f.title === 'string' && typeof f.text === 'string';
      }).slice(0, 6).map(function (f) { return { title: f.title, text: f.text }; }) : []
    };
    res.status(200).json(clean);
  } catch (e) {
    res.status(502).json({ error: 'upstream_failed' });
  }
};
