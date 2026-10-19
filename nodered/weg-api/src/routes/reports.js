'use strict';

const router = require('express').Router();
const reportService = require('../services/reports');
const dailyReport = require('../services/dailyReport');
const reporteCamaras = require('../services/reporteCamaras');
const reporteDiario = require('../services/reporteDiario');
const manual = require('../services/manual');
const { isAdminRole } = require('../middleware/auth');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// GET /api/reports/manual?date=YYYY-MM-DD — datos cargados a mano (lluvia/río)
router.get('/manual', (req, res) => {
  const date = DATE_RE.test(req.query.date || '') ? req.query.date : manual.localDateStr();
  res.json(manual.getWithStatus(date));
});

// PUT /api/reports/manual { date, rainMm, riverM } — editable hasta el cierre
// del día (reporte automático del día siguiente); después, solo admin.
router.put('/manual', (req, res) => {
  try {
    const date = (req.body && req.body.date) || '';
    if (!DATE_RE.test(date)) return res.status(400).json({ error: 'Fecha inválida (YYYY-MM-DD)' });
    const st = manual.getWithStatus(date);
    if (st.future) return res.status(400).json({ error: 'No se puede cargar un día futuro' });
    const isAdmin = req.auth && isAdminRole(req.auth.role);
    if (st.locked && !isAdmin) {
      return res.status(409).json({ error: `El día ${date} ya cerró. Solo un administrador puede modificarlo.` });
    }
    manual.set(date, req.body, req.auth && req.auth.user);
    res.json(manual.getWithStatus(date));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// POST /api/reports/generate — generate report data
router.post('/generate', async (req, res) => {
  try {
    const rows = await reportService.generateReport(req.body);
    res.json({ count: rows.length, data: rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/reports/buckets — buckets disponibles (vivo + archivos)
router.get('/buckets', async (req, res) => {
  try {
    res.json({ buckets: await reportService.listBuckets() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/reports/series — series JSON (drives + medidores) para gráficos
router.post('/series', async (req, res) => {
  try {
    const data = await reportService.generateSeries(req.body);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/reports/camaras/xlsx { fecha } — Excel de cámaras del día
router.post('/camaras/xlsx', async (req, res) => {
  let fecha;
  try { fecha = reporteCamaras.validarFecha(req.body && req.body.fecha); } catch (e) { return res.status(400).json({ error: e.message }); }
  try {
    const { xlsx } = await reporteCamaras.generarXlsx(fecha);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=reporte-camaras_${fecha}.xlsx`);
    res.send(xlsx);
  } catch (e) {
    console.error('[API] reports/camaras/xlsx:', e.message);
    res.status(502).json({ error: 'Error consultando el histórico' });
  }
});

// POST /api/reports/summary — resumen agregado de un rango (JSON)
router.post('/summary', async (req, res) => {
  try {
    res.json(await reportService.generateSummary(req.body));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/reports/xlsx — reporte general en Excel (detalle + resumen)
router.post('/xlsx', async (req, res) => {
  try {
    const rows = await reportService.generateReport(req.body);
    let summary = null;
    if (req.body.summary) {
      summary = await reportService.generateSummary({
        from: req.body.from, to: req.body.to, bucket: req.body.bucket,
      });
    }
    const xlsx = reportService.reportToXLSX(rows, summary);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=frio-reporte.xlsx');
    res.send(xlsx);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/reports/csv — download CSV
router.post('/csv', async (req, res) => {
  try {
    const rows = await reportService.generateReport(req.body);
    const csv = reportService.toCSV(rows);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=frio-report.csv');
    res.send(csv);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/reports/pdf — download PDF
router.post('/pdf', async (req, res) => {
  try {
    const rows = await reportService.generateReport(req.body);
    const pdf = await reportService.toPDF(rows, req.body.title || 'Reporte Frío SCADA');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=frio-report.pdf');
    res.send(pdf);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/reportes/diario.pdf?fecha=YYYY-MM-DD (por defecto ayer) — el PDF del reporte diario de ese día.
// Se monta aparte en server.js (después de requireAuth): cualquier usuario con sesión.
async function diarioPdf(req, res) {
  let fecha;
  try { fecha = reporteCamaras.validarFecha(req.query.fecha === undefined ? reporteCamaras.ayer() : req.query.fecha); } catch (e) { return res.status(400).json({ error: e.message }); }
  try {
    const { pdf } = await reporteDiario.generarPdf(fecha, { sigue: dailyReport.sigueVivo() });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=reporte-camaras_${fecha}.pdf`);
    res.send(pdf);
  } catch (e) {
    console.error('[API] reportes/diario.pdf:', e.message);
    res.status(502).json({ error: 'Error consultando el histórico' });
  }
}

module.exports = router;
module.exports.diarioPdf = diarioPdf;

