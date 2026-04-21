const express = require('express');
const sharp = require('sharp');
const multer = require('multer');
const https = require('https');
const http = require('http');

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

function downloadImage(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    client.get(url, (res) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

const OUTPUT_SIZE = 1080;

app.post('/brand', upload.fields([
  { name: 'raw', maxCount: 1 }
]), async (req, res) => {
  try {
    if (!req.files['raw']) {
      return res.status(400).json({ error: 'Raw image is required.' });
    }
    if (!req.body.reference_url) {
      return res.status(400).json({ error: 'reference_url is required.' });
    }

    const rawBuffer = req.files['raw'][0].buffer;
    const referenceBuffer = await downloadImage(req.body.reference_url);

    const refMeta = await sharp(referenceBuffer).metadata();
    const refW = refMeta.width;
    const refH = refMeta.height;

    const logoStripH = Math.floor(refH * 0.15);
    const logoStrip = await sharp(referenceBuffer)
      .extract({ left: 0, top: 0, width: refW, height: logoStripH })
      .resize(OUTPUT_SIZE, Math.floor(OUTPUT_SIZE * 0.15), { fit: 'fill' })
      .toBuffer();

    const bannerTopInRef = Math.floor(refH * 0.65);
    const bannerH = refH - bannerTopInRef;
    const bannerStrip = await sharp(referenceBuffer)
      .extract({ left: 0, top: bannerTopInRef, width: refW, height: bannerH })
      .resize(OUTPUT_SIZE, Math.floor(OUTPUT_SIZE * 0.35), { fit: 'fill' })
      .toBuffer();

    const resizedRaw = await sharp(rawBuffer)
      .resize(OUTPUT_SIZE, OUTPUT_SIZE, { fit: 'cover', position: 'centre' })
      .toBuffer();

    const bannerTopPosition = Math.floor(OUTPUT_SIZE * 0.65);

    const branded = await sharp(resizedRaw)
      .composite([
        { input: bannerStrip, top: bannerTopPosition, left: 0 },
        { input: logoStrip, top: 0, left: 0 }
      ])
      .png()
      .toBuffer();

    res.json({
      success: true,
      image_base64: branded.toString('base64'),
      media_type: 'image/png'
    });

  } catch (error) {
    console.error('Branding error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Image branding server running on port ${PORT}`);
});
