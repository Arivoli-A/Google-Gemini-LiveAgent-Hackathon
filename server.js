import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;

// Serve static files from the 'dist' directory
app.use(express.static(path.join(__dirname, 'dist')));

// Endpoint to provide runtime configuration to the frontend
app.get('/api/config', (req, res) => {
  res.json({
    GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
    // Cloud Run provides GOOGLE_CLOUD_PROJECT automatically in some environments, 
    // or we can use the one set by the user.
    GCP_PROJECT: process.env.GCP_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || '',
    GCP_LOCATION: process.env.GCP_LOCATION || 'us-central1'
  });
});

// Fallback to index.html for SPA routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(port, '0.0.0.0', () => {
  console.log(`Server listening on port ${port}`);
});
