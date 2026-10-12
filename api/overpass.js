// Vercel serverless proxy voor Overpass: geen CORS-gedoe, nette User-Agent, terugval over servers.
const ENDPOINTS = (process.env.OVERPASS_ENDPOINTS ||
  'https://overpass-api.de/api/interpreter,https://overpass.kumi.systems/api/interpreter,https://overpass.openstreetmap.fr/api/interpreter')
  .split(',').map(s => s.trim()).filter(Boolean);
const UA = 'Rondje-looproute/1.0 (' + (process.env.OVERPASS_CONTACT || 'zet OVERPASS_CONTACT in Vercel') + ')';
const cache = new Map();   // simpele cache per serverinstantie

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const q = req.body && req.body.data;
  if (typeof q !== 'string' || !q.startsWith('[out:json]') || q.length > 30000)
    return res.status(400).json({ error: 'ongeldige query' });
  if (cache.has(q)) return res.status(200).setHeader('X-Cache', 'HIT').send(cache.get(q));

  const errs = [];
  for (const url of ENDPOINTS) {
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 18000);
    try {
      const r = await fetch(url, {
        method: 'POST', signal: ctl.signal,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': UA, 'Accept': 'application/json' },
        body: 'data=' + encodeURIComponent(q)
      });
      const text = await r.text();
      clearTimeout(t);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = JSON.parse(text);
      if (!j.elements || !j.elements.length) throw new Error('leeg antwoord' + (j.remark ? ': ' + j.remark : ''));
      if (cache.size > 30) cache.delete(cache.keys().next().value);
      cache.set(q, text);
      return res.status(200).setHeader('Content-Type', 'application/json').send(text);
    } catch (e) {
      clearTimeout(t);
      errs.push(new URL(url).hostname + ': ' + (e.name === 'AbortError' ? 'time-out' : e.message));
    }
  }
  res.status(502).json({ error: errs.join(' | ') });
};
