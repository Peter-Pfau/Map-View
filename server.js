const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'Assests.json');
const NORMALIZED_PUBLIC = path.resolve(PUBLIC_DIR).toLowerCase();

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const { pathname } = parsedUrl;

  try {
    if (req.method === 'GET' && pathname === '/') {
      if (!fs.existsSync(DATA_FILE)) {
        res.writeHead(302, { Location: '/configure' });
        res.end();
        return;
      }
      return serveStaticFile(res, path.join(PUBLIC_DIR, 'index.html'));
    }

    if (req.method === 'GET' && pathname === '/configure') {
      return serveStaticFile(res, path.join(PUBLIC_DIR, 'configure.html'));
    }

    if (req.method === 'GET' && pathname === '/api/assets') {
      if (!fs.existsSync(DATA_FILE)) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Assets file not found' }));
        return;
      }

      const fileStream = fs.createReadStream(DATA_FILE);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      fileStream.pipe(res);
      return;
    }

    if (req.method === 'POST' && pathname === '/api/assets') {
      let body = '';
      req.on('data', chunk => {
        body += chunk;
        if (body.length > 1e6) {
          req.connection.destroy();
        }
      });

      req.on('end', async () => {
        try {
          const payload = JSON.parse(body || '{}');
          validatePayload(payload);

          await fs.promises.mkdir(DATA_DIR, { recursive: true });
          const formatted = JSON.stringify(payload, null, 2);
          await fs.promises.writeFile(DATA_FILE, formatted, 'utf8');

          res.writeHead(201, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ message: 'Assets saved successfully' }));
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ error: err.message || 'Invalid request' }));
        }
      });
      return;
    }

    if (req.method === 'GET' && pathname.startsWith('/static/')) {
      const relativePath = pathname.replace('/static/', '');
      const normalizedRelative = path.normalize(relativePath).replace(/^\.\/+/, '');
      const absolutePath = path.resolve(PUBLIC_DIR, normalizedRelative);

      if (!absolutePath.toLowerCase().startsWith(NORMALIZED_PUBLIC)) {
        res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Forbidden');
        return;
      }

      return serveStaticFile(res, absolutePath);
    }

    if (req.method === 'GET' && pathname === '/favicon.ico') {
      res.writeHead(204);
      res.end();
      return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not Found');
  } catch (err) {
    console.error('Server error:', err);
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Internal Server Error');
  }
});

function serveStaticFile(res, filePath) {
  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not Found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const mime = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mime });

    const readStream = fs.createReadStream(filePath);
    readStream.pipe(res);
    readStream.on('error', streamErr => {
      console.error('Stream error:', streamErr);
      res.end();
    });
  });
}

function validatePayload(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Payload must be an object');
  }

  const { title, assets } = payload;

  if (typeof title !== 'string' || !title.trim()) {
    throw new Error('Title is required');
  }

  if (!Array.isArray(assets) || assets.length === 0) {
    throw new Error('Assets must be a non-empty array');
  }

  assets.forEach((asset, index) => {
    if (typeof asset !== 'object' || asset === null) {
      throw new Error(`Asset at index ${index} must be an object`);
    }
    const requiredFields = ['name', 'city', 'state'];
    requiredFields.forEach(field => {
      if (typeof asset[field] !== 'string' || !asset[field].trim()) {
        throw new Error(`Asset at index ${index} is missing required field: ${field}`);
      }
    });
    if (asset.notes && typeof asset.notes !== 'string') {
      throw new Error(`Asset at index ${index} has an invalid notes field`);
    }
  });
}

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`Server listening on http://localhost:${PORT}`);
  });
}

module.exports = {
  server,
  DATA_FILE
};
