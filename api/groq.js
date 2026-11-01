// PageCraft AI proxy (Vercel serverless function) — Groq edition.
// The Groq API key lives ONLY in the Vercel environment variable
// GROQ_API_KEY. It is never sent to the browser and never appears
// in this file. The page POSTs { prompt } here and receives back
// validated page JSON it can apply to the preview.
function extractJson(text) {
  var cleaned = String(text || '').replace(/```json/gi, '').replace(/```/g, '').trim();
  try { return JSON.parse(cleaned); } catch (e) { /* fall through */ }
  var start = cleaned.indexOf('{');
  var end = cleaned.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try { return JSON.parse(cleaned.slice(start, end + 1)); } catch (e) { /* fall through */ }
  }
  return null;
}

async function callGroq(model, apiKey, prompt) {
  var system = 'You are a landing page copy assistant. Reply with ONLY a JSON object, no markdown, no explanation, with these fields: ' +
    'headline (string), sub (string), buttonText (string), color (a hex colour like #111111), ' +
    'features (array of up to 6 objects, each with title and text strings). ' +
    'Keep the copy short, professional and in the same language as the user prompt.';
  var r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
    body: JSON.stringify({
      model: model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: prompt }
      ],
      temperature: 0.7,
      response_format: { type: 'json_object' }
    })
  });
  var data = await r.json().catch(function () { return {}; });
  return { status: r.status, data: data };
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }
  const apiKey = process.env.GROQ_API_KEY;
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
  try {
    var models = ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant'];
    var lastErr = null;
    for (var i = 0; i < models.length; i++) {
      var result = await callGroq(models[i], apiKey, prompt);
      var data = result.data || {};
      if (data.error) {
        var msg = (data.error.message || '').toString();
        if (/invalid_api_key|Incorrect API key|unauthorized|authentication/i.test(msg) || result.status === 401) {
          res.status(502).json({ error: 'invalid_key', detail: 'Groq rejected the API key. Check the GROQ_API_KEY value in Vercel.' });
          return;
        }
        lastErr = data.error;
        continue;
      }
      var text = '';
      try { text = data.choices[0].message.content || ''; } catch (e) { text = ''; }
      if (!text) { lastErr = { message: 'empty response from model' }; continue; }
      var out = extractJson(text);
      if (!out) { lastErr = { message: 'unparseable model response' }; continue; }
      var clean = {
        headline: typeof out.headline === 'string' ? out.headline : '',
        sub: typeof out.sub === 'string' ? out.sub : '',
        buttonText: typeof out.buttonText === 'string' ? out.buttonText : '',
        color: typeof out.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(out.color) ? out.color : '#111111',
        features: Array.isArray(out.features) ? out.features.filter(function (f) {
          return f && typeof f.title === 'string' && typeof f.text === 'string';
        }).slice(0, 6).map(function (f) { return { title: f.title, text: f.text }; }) : []
      };
      res.status(200).json(clean);
      return;
    }
    res.status(502).json({ error: 'bad_ai_response', detail: lastErr ? String(lastErr.message || lastErr).slice(0, 200) : 'no usable model response' });
  } catch (e) {
    res.status(502).json({ error: 'upstream_failed' });
  }
};
