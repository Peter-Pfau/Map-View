const https = require('https');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = process.env.PORT || 3050;
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

const TEST_REMOTE_RESPONSE = {
  title: 'Remote Sample Assets',
  assets: [
    { name: 'HQ - Seattle', city: 'Seattle', state: 'WA', notes: 'Global headquarters', ip: '10.1.1.100' },
    { name: 'Edge Node - Portland', city: 'Portland', state: 'OR', notes: 'Pacific Northwest edge site', ip: '10.2.1.50' },
    { name: 'Regional DC - San Francisco', city: 'San Francisco', state: 'CA', notes: 'West coast region', ip: '10.3.1.10' },
    { name: 'Regional DC - Los Angeles', city: 'Los Angeles', state: 'CA', notes: 'Media workloads' },
    { name: 'Cloud POP - Phoenix', city: 'Phoenix', state: 'AZ', notes: 'Backup connectivity', ip: '10.4.1.25' },
    { name: 'Operations Hub - Denver', city: 'Denver', state: 'CO', notes: 'Rocky Mountain operations' },
    { name: 'Regional Office - Dallas', city: 'Dallas', state: 'TX', notes: 'South central office', ip: '192.168.100.50' },
    { name: 'Regional DC - Austin', city: 'Austin', state: 'TX', notes: 'Disaster recovery site', ip: '172.16.10.100' },
    { name: 'Field Office - Minneapolis', city: 'Minneapolis', state: 'MN', notes: 'Upper Midwest field team' },
    { name: 'Support Center - Chicago', city: 'Chicago', state: 'IL', notes: 'Tier 1 support center', ip: '10.5.2.75' },
    { name: 'Innovation Lab - Detroit', city: 'Detroit', state: 'MI', notes: 'Automotive research' },
    { name: 'Analytics Hub - Atlanta', city: 'Atlanta', state: 'GA', notes: 'Data analytics workloads', ip: '10.6.1.200' },
    { name: 'Regional Office - Miami', city: 'Miami', state: 'FL', notes: 'Latin America liaison' },
    { name: 'Field Depot - Charlotte', city: 'Charlotte', state: 'NC', notes: 'Field hardware depot' },
    { name: 'Security Ops - Washington', city: 'Washington', state: 'DC', notes: 'Gov compliance team', ip: '10.10.1.5' },
    { name: 'Research Center - Boston', city: 'Boston', state: 'MA', notes: 'R&D hub', ip: '10.7.1.150' },
    { name: 'Regional Office - New York', city: 'New York', state: 'NY', notes: 'Trading floor support', ip: '10.8.1.100' },
    { name: 'Satellite Office - New York B', city: 'New York', state: 'NY', notes: 'Customer success pod' },
    { name: 'Content Cache - Newark', city: 'Newark', state: 'NJ', notes: 'Northeast CDN node', ip: '10.9.1.250' },
    { name: 'Support Pod - Philadelphia', city: 'Philadelphia', state: 'PA', notes: 'Support pod' },
    { name: 'Support Pod - Philadelphia 2', city: 'Philadelphia', state: 'PA', notes: 'Overflow support pod' },
    { name: 'Regional DC - Toronto', city: 'Toronto', state: 'ON', notes: 'Canada region primary', ip: '10.11.1.50' },
    { name: 'Backup DC - Toronto', city: 'Toronto', state: 'ON', notes: 'Canada DR site', ip: '10.11.2.50' }
  ]
};

const server = https.createServer({
  pfx: fs.readFileSync(path.join(__dirname, 'certs', 'vagwsopsalert2.va.gov.pfx')),
  passphrase: 'Password123!2025'
}, async (req, res) => {
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

    if (req.method === 'GET' && pathname === '/api/test-assets') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(TEST_REMOTE_RESPONSE));
      return;
    }

    if (req.method === 'POST' && pathname === '/api/test-connection') {
      let body = '';
      req.on('data', chunk => {
        body += chunk;
        if (body.length > 1e6) {
          req.connection.destroy();
        }
      });

      req.on('end', async () => {
        try {
          const { url: targetUrl } = JSON.parse(body || '{}');
          
          if (!targetUrl) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'URL is required' }));
            return;
          }

          // Make request to external API (server-side, no CORS issues)
          const urlObj = new URL(targetUrl);
          const options = {
            hostname: urlObj.hostname,
            port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
            path: urlObj.pathname + urlObj.search,
            method: 'GET',
            headers: {
              'Accept': 'application/json',
              'User-Agent': 'Map-View/1.0'
            },
            rejectUnauthorized: false // For self-signed certificates
          };

          const protocol = urlObj.protocol === 'https:' ? https : require('http');
          
          const proxyReq = protocol.request(options, (proxyRes) => {
            let data = '';
            
            proxyRes.on('data', (chunk) => {
              data += chunk;
            });
            
            proxyRes.on('end', () => {
              try {
                const parsedData = JSON.parse(data);
                
                // Return response with headers for client analysis
                res.writeHead(200, { 
                  'Content-Type': 'application/json; charset=utf-8',
                  'Access-Control-Allow-Origin': '*'
                });
                res.end(JSON.stringify({
                  status: proxyRes.statusCode,
                  headers: proxyRes.headers,
                  data: parsedData
                }));
              } catch (parseError) {
                res.writeHead(502, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ 
                  error: 'Invalid JSON response from external API',
                  details: parseError.message
                }));
              }
            });
          });

          proxyReq.on('error', (error) => {
            res.writeHead(502, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ 
              error: 'Failed to connect to external API',
              details: error.message
            }));
          });

          proxyReq.setTimeout(10000, () => {
            proxyReq.destroy();
            res.writeHead(504, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Request timeout' }));
          });

          proxyReq.end();
          
        } catch (error) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid request', details: error.message }));
        }
      });
      return;
    }

    if (req.method === 'GET' && pathname === '/configure') {
      return serveStaticFile(res, path.join(PUBLIC_DIR, 'configure.html'));
    }

    if (req.method === 'GET' && pathname === '/test-map.html') {
      return serveStaticFile(res, path.join(PUBLIC_DIR, 'test-map.html'));
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
      const icoPath = path.join(PUBLIC_DIR, 'favicon.ico');
      const svgPath = path.join(PUBLIC_DIR, 'favicon.svg');
      if (fs.existsSync(icoPath)) {
        return serveStaticFile(res, icoPath);
      }
      if (fs.existsSync(svgPath)) {
        return serveStaticFile(res, svgPath);
      }
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

  const { title } = payload;
  const assets = Array.isArray(payload.assets) ? payload.assets : [];
  const remoteSourceRaw = payload.remoteSource && typeof payload.remoteSource === 'object' ? payload.remoteSource : {};
  const remoteEnabled = Boolean(remoteSourceRaw.enabled);
  const remoteUrl = typeof remoteSourceRaw.url === 'string' ? remoteSourceRaw.url.trim() : '';

  if (typeof title !== 'string' || !title.trim()) {
    throw new Error('Title is required');
  }

  if (remoteEnabled) {
    if (!remoteUrl) {
      throw new Error('Remote source URL is required when API sync is enabled');
    }
    let parsed;
    try {
      parsed = new URL(remoteUrl);
    } catch (err) {
      throw new Error('Remote source URL is not a valid URL');
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error('Remote source URL must use http or https');
    }
  }

  if (!remoteEnabled && assets.length === 0) {
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
    if (asset.ip && typeof asset.ip !== 'string') {
      throw new Error(`Asset at index ${index} has an invalid ip field`);
    }
  });

  payload.assets = assets;
  payload.remoteSource = {
    enabled: remoteEnabled,
    url: remoteUrl
  };
}

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`Server listening on https://localhost:${PORT}`);
  });
}

module.exports = {
  server,
  DATA_FILE
};
