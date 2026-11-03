// PageCraft AI proxy (Vercel serverless function) — Assistant edition.
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

var AI_FONTS = ["'Inter',sans-serif", "'Poppins',sans-serif", "'Manrope',sans-serif", "'Playfair Display',serif", "'Space Grotesk',sans-serif", "'Montserrat',sans-serif", "'DM Sans',sans-serif", "'Sora',sans-serif", "'Work Sans',sans-serif", "'Raleway',sans-serif", "'Oswald',sans-serif", "'Lora',serif", "'Fraunces',serif", "Georgia,serif"];
function aiStr(v, max) { return typeof v === 'string' ? v.trim().slice(0, max || 300) : ''; }
function aiHex(v, fb) { return typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v.trim()) ? v.trim() : fb; }
function aiClean(out) {
  return {
    pageTitle: aiStr(out.pageTitle, 80),
    badge: aiStr(out.badge, 60),
    headline: aiStr(out.headline, 160),
    sub: aiStr(out.sub, 300),
    buttonText: aiStr(out.buttonText, 60),
    ctaText: aiStr(out.buttonText, 60),
    color: aiHex(out.color, '#111111'),
    bg: aiHex(out.bg, '#FFFFFF'),
    font: AI_FONTS.indexOf(out.font) > -1 ? out.font : "'Inter',sans-serif",
    layout: ['center', 'split', 'left'].indexOf(out.layout) > -1 ? out.layout : 'center',
    radius: ['999px', '12px', '4px'].indexOf(out.radius) > -1 ? out.radius : '999px',
    features: Array.isArray(out.features) ? out.features.filter(function (f) {
      return f && typeof f.title === 'string' && typeof f.text === 'string';
    }).slice(0, 6).map(function (f) { return { title: aiStr(f.title, 80), text: aiStr(f.text, 160) }; }) : [],
    price: (out.price && aiStr(out.price.amount, 40)) ? { amount: aiStr(out.price.amount, 40), old: aiStr(out.price.old, 40), note: aiStr(out.price.note, 160) } : null,
    proof: (out.proof && aiStr(out.proof.quote, 300)) ? { quote: aiStr(out.proof.quote, 300), author: aiStr(out.proof.author, 80) } : null
  };
}

async function callGroq(model, apiKey, prompt) {
  var system = 'You are a landing page copy assistant. STRICT RULE: do exactly what the user describes and nothing more. ' +
    'Do not invent features, sections, buttons, prices, locations, testimonials or any facts the user did not mention. ' +
    'Do not add extra content beyond the user request. If the request is vague, keep the copy short and generic rather than guessing details. ' +
    'Reply with ONLY a JSON object, no markdown, no explanation, with these fields: ' +
    'pageTitle (string), badge (short uppercase string), headline (string), sub (string), buttonText (string), ' +
    'color (a hex colour like #111111 — the theme colour that fits the business), ' +
    'bg (a hex page background — light like #FFFFFF unless the user asks for a dark page), ' +
    'font (exactly one of: "\'Inter\',sans-serif", "\'Poppins\',sans-serif", "\'Manrope\',sans-serif", "\'Playfair Display\',serif", "\'Space Grotesk\',sans-serif", "\'Montserrat\',sans-serif", "\'DM Sans\',sans-serif", "\'Sora\',sans-serif", "\'Work Sans\',sans-serif", "\'Raleway\',sans-serif", "\'Oswald\',sans-serif", "\'Lora\',serif", "\'Fraunces\',serif", "Georgia,serif" — pick the one that fits the page mood), ' +
    'layout (one of: "center", "split", "left"), radius (one of: "999px", "12px", "4px"), ' +
    'features (array of up to 6 objects, each with title and text strings, only for features the user actually described), ' +
    'price (object with amount, old and note strings — ONLY when the user mentions a price, an offer or something for sale; otherwise null), ' +
    'proof (object with quote and author strings — ONLY when the user includes or asks for a testimonial or review; otherwise null). ' +
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

async function listUsableModels(apiKey) {
  try {
    var r = await fetch('https://api.groq.com/openai/v1/models', {
      headers: { 'Authorization': 'Bearer ' + apiKey }
    });
    var data = await r.json().catch(function () { return {}; });
    var ids = (data.data || []).map(function (m) { return m.id; }).filter(Boolean);
    var prefer = ids.filter(function (id) { return /llama-3|gpt-oss|kimi|qwen3/i.test(id); });
    var rest = ids.filter(function (id) { return !/llama-3|gpt-oss|kimi|qwen3/i.test(id); });
    return prefer.concat(rest);
  } catch (e) { return []; }
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
    var discovered = await listUsableModels(apiKey);
    var models = discovered.length ? discovered.slice(0, 4)
      : ['openai/gpt-oss-120b', 'llama-3.3-70b-versatile', 'moonshotai/kimi-k2-instruct', 'qwen/qwen3-32b'];
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
      var clean = aiClean(out);
      // The site's reader looks for a chat-style answer first, so include
      // that shape too; the plain page fields stay on top for direct use.
      clean.choices = [{ message: { content: JSON.stringify(clean) } }];
      res.status(200).json(clean);
      return;
    }
    res.status(502).json({ error: 'bad_ai_response', detail: lastErr ? String(lastErr.message || lastErr).slice(0, 200) : 'no usable model response' });
  } catch (e) {
    res.status(502).json({ error: 'upstream_failed' });
  }
};
