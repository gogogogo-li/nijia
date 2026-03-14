/**
 * Serve frontend build and expose /api/health. Run after build: npm run build && npm run serve
 */
const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/api/health', (req, res) => res.status(200).end());

app.use(express.static(path.join(__dirname, 'build')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'build', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Frontend serving on http://localhost:${PORT}`);
});
