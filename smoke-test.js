const fs = require('fs');
const http = require('http');
const { server, DATA_FILE } = require('./server');

const backupExists = fs.existsSync(DATA_FILE);
const backupData = backupExists ? fs.readFileSync(DATA_FILE) : null;

(async () => {
  await new Promise(resolve => server.listen(0, resolve));
  const { port } = server.address();
  const baseOptions = {
    hostname: '127.0.0.1',
    port
  };

  const initial = await httpRequest({ ...baseOptions, path: '/', method: 'GET' });
  if (!backupExists && initial.statusCode !== 302) {
    throw new Error(`Expected redirect when assets missing, received ${initial.statusCode}`);
  }
  if (backupExists && initial.statusCode !== 200) {
    throw new Error(`Expected map page when assets exist, received ${initial.statusCode}`);
  }

  const samplePayload = {
    title: 'Test Assets Map',
    assets: [
      { name: 'Primary DC', city: 'Seattle', state: 'WA', notes: 'Cloud Edge' },
      { name: 'Backup DC', city: 'Austin', state: 'TX', notes: 'Disaster recovery' }
    ]
  };

  const postResponse = await httpRequest({
    ...baseOptions,
    path: '/api/assets',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    }
  }, JSON.stringify(samplePayload));

  if (postResponse.statusCode !== 201) {
    throw new Error(`Expected 201 when saving assets, received ${postResponse.statusCode}`);
  }

  const getResponse = await httpRequest({ ...baseOptions, path: '/api/assets', method: 'GET' });
  if (getResponse.statusCode !== 200) {
    throw new Error(`Expected 200 when retrieving assets, received ${getResponse.statusCode}`);
  }

  const payload = JSON.parse(getResponse.body);
  if (payload.title !== samplePayload.title || payload.assets.length !== samplePayload.assets.length) {
    throw new Error('Payload mismatch when reading assets back');
  }

  const remotePayload = {
    title: 'Remote Source Map',
    assets: [],
    remoteSource: {
      enabled: true,
      url: 'https://example.com/assets.json'
    }
  };

  const remotePostResponse = await httpRequest({
    ...baseOptions,
    path: '/api/assets',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    }
  }, JSON.stringify(remotePayload));

  if (remotePostResponse.statusCode !== 201) {
    throw new Error(`Expected 201 when saving remote configuration, received ${remotePostResponse.statusCode}`);
  }

  const remoteGetResponse = await httpRequest({ ...baseOptions, path: '/api/assets', method: 'GET' });
  if (remoteGetResponse.statusCode !== 200) {
    throw new Error(`Expected 200 when retrieving remote-configured assets, received ${remoteGetResponse.statusCode}`);
  }

  const remoteData = JSON.parse(remoteGetResponse.body);
  if (!remoteData.remoteSource || !remoteData.remoteSource.enabled) {
    throw new Error('Remote configuration flag not persisted');
  }
  if (remoteData.remoteSource.url !== remotePayload.remoteSource.url) {
    throw new Error('Remote configuration URL not persisted');
  }
  if (!Array.isArray(remoteData.assets) || remoteData.assets.length !== 0) {
    throw new Error('Remote configuration should persist an empty asset array when API is enabled');
  }

  console.log('Smoke test passed.');
})()
  .catch(err => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await new Promise(resolve => server.close(resolve));
    if (backupExists) {
      fs.writeFileSync(DATA_FILE, backupData);
    } else if (fs.existsSync(DATA_FILE)) {
      fs.unlinkSync(DATA_FILE);
    }
  });

function httpRequest(options, body) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, res => {
      let responseBody = '';
      res.setEncoding('utf8');
      res.on('data', chunk => {
        responseBody += chunk;
      });
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: responseBody
        });
      });
    });

    req.on('error', reject);

    if (body) {
      req.write(body);
    }

    req.end();
  });
}
