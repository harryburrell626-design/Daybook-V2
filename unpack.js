// Unpacks bundle.txt into the folders the app needs (server, public, db ...). Run at build time.
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const files = JSON.parse(zlib.gunzipSync(Buffer.from(fs.readFileSync(path.join(__dirname, 'bundle.txt'), 'utf8').trim(), 'base64')).toString());
for (const [p, data] of Object.entries(files)) {
  const out = path.join(__dirname, p);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, Buffer.from(data, 'base64'));
}
console.log('Unpacked ' + Object.keys(files).length + ' files');
