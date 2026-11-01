// PageCraft Firebase config endpoint (server-side only).
// Reads the Firebase web config from Vercel environment variables ONLY.
// No config value is ever stored in this file, in site code, or in the repo.
// Required env vars (Vercel dashboard -> Project -> Settings -> Environment
// Variables, Production): FIREBASE_API_KEY, FIREBASE_AUTH_DOMAIN,
// FIREBASE_PROJECT_ID, FIREBASE_STORAGE_BUCKET, FIREBASE_MESSAGING_SENDER_ID,
// FIREBASE_APP_ID. Optional: FIREBASE_DATABASE_URL, FIREBASE_MEASUREMENT_ID.
module.exports = function (req, res) {
  res.setHeader('Cache-Control', 'no-store');
  var cfg = {
    apiKey: process.env.FIREBASE_API_KEY || '',
    authDomain: process.env.FIREBASE_AUTH_DOMAIN || '',
    projectId: process.env.FIREBASE_PROJECT_ID || '',
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET || '',
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || '',
    appId: process.env.FIREBASE_APP_ID || ''
  };
  if (process.env.FIREBASE_DATABASE_URL) cfg.databaseURL = process.env.FIREBASE_DATABASE_URL;
  if (process.env.FIREBASE_MEASUREMENT_ID) cfg.measurementId = process.env.FIREBASE_MEASUREMENT_ID;
  var missing = Object.keys(cfg).filter(function (k) { return !cfg[k]; });
  if (missing.length) {
    res.status(503).json({ error: 'firebase_not_configured', missing: missing });
    return;
  }
  res.status(200).json(cfg);
};
