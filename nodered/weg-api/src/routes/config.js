'use strict';

const router = require('express').Router();
const configService = require('../services/config');
const { validateConfig } = require('../services/validate');

// GET /api/config — full config
router.get('/', (req, res) => {
  const cfg = configService.get();
  if (!cfg) return res.status(500).json({ error: 'Cannot read config' });
  res.json(cfg);
});

// PUT /api/config — save full config (validada: una config rota dejaba
// al poller sin dispositivos al recargar)
router.put('/', (req, res) => {
  const errors = validateConfig(req.body);
  if (errors.length) {
    return res.status(400).json({ error: 'Config invalida', details: errors });
  }
  if (configService.save(req.body)) {
    res.json({ ok: true });
  } else {
    res.status(500).json({ error: 'Cannot save config' });
  }
});

module.exports = router;
