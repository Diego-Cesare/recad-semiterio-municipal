const express = require('express');
const multer = require('multer');
const PDFDocument = require('pdfkit');
const nodemailer = require('nodemailer');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

const hasSmtpConfig =
  !!process.env.SMTP_HOST &&
  !!process.env.SMTP_PORT &&
  !!process.env.SMTP_USER &&
  !!process.env.SMTP_PASS &&
  !!process.env.TARGET_EMAIL;

if (!hasSmtpConfig) {
  console.warn('SMTP incompleto. Envio de e-mail ficara indisponivel ate configurar variaveis.');
}

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static('public'));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    files: 6,
    fileSize: 10 * 1024 * 1024,
  },
  fileFilter: (req, file, cb) => {
    const supportedTypes = ['image/jpeg', 'image/png'];
    if (file.mimetype && supportedTypes.includes(file.mimetype)) {
      return cb(null, true);
    }
    return cb(new Error('Apenas imagens JPG ou PNG sao permitidas.'));
  },
});

function normalizeText(value) {
  return (value || '').toString().trim();
}

function generatePdfBuffer(formData, files) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40 });
    const chunks = [];

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(20).text('Formulario de Cadastro', { align: 'center' });
    doc.moveDown();
    doc.fontSize(12);

    doc.text(`Nome: ${formData.nome}`);
    doc.text(`CPF: ${formData.cpf}`);
    doc.text(`Telefone: ${formData.telefone}`);
    doc.text(`Familiar: ${formData.familiar}`);
    doc.text(`Email: ${formData.email}`);
    doc.text(`Data de envio: ${new Date().toISOString()}`);

    if (files.length > 0) {
      doc.addPage();
      doc.fontSize(16).text('Imagens enviadas', { align: 'center' });
      doc.moveDown();

      files.forEach((file, index) => {
        if (index > 0) {
          doc.addPage();
        }

        doc.fontSize(12).text(`Imagem ${index + 1}: ${file.originalname}`);
        doc.moveDown(0.5);

        try {
          doc.image(file.buffer, {
            fit: [500, 650],
            align: 'center',
            valign: 'center',
          });
        } catch (error) {
          doc.text('Nao foi possivel renderizar esta imagem no PDF.');
        }
      });
    }

    doc.end();
  });
}

function createTransporter() {
  const portValue = Number(process.env.SMTP_PORT || 587);
  const secure = portValue === 465;

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: portValue,
    secure,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

app.post('/api/send-pdf', upload.array('images', 6), async (req, res) => {
  try {
    if (!hasSmtpConfig) {
      return res.status(500).json({
        message: 'SMTP nao configurado no servidor. Preencha as variaveis de ambiente.',
      });
    }

    const nome = normalizeText(req.body.nome);
    const cpf = normalizeText(req.body.cpf);
    const telefone = normalizeText(req.body.telefone);
    const familiar = normalizeText(req.body.familiar);
    const email = normalizeText(req.body.email);

    if (!nome || !cpf || !telefone || !familiar || !email) {
      return res.status(400).json({ message: 'Preencha todos os campos obrigatorios.' });
    }

    const files = req.files || [];
    const pdfBuffer = await generatePdfBuffer({ nome, cpf, telefone, familiar, email }, files);
    const transporter = createTransporter();

    await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: process.env.TARGET_EMAIL,
      subject: `Novo formulario - ${nome}`,
      text: [
        'Novo formulario recebido.',
        `Nome: ${nome}`,
        `CPF: ${cpf}`,
        `Telefone: ${telefone}`,
        `Familiar: ${familiar}`,
        `Email informado: ${email}`,
      ].join('\n'),
      replyTo: email,
      attachments: [
        {
          filename: `formulario-${Date.now()}.pdf`,
          content: pdfBuffer,
          contentType: 'application/pdf',
        },
      ],
    });

    const imageCount = files.length;
    return res.json({
      message: `Formulario enviado com sucesso. ${imageCount} imagem(ns) anexada(s).`,
    });
  } catch (error) {
    if (error instanceof multer.MulterError) {
      return res.status(400).json({ message: `Erro de upload: ${error.message}` });
    }

    if (error && error.message === 'Apenas imagens JPG ou PNG sao permitidas.') {
      return res.status(400).json({ message: error.message });
    }

    console.error('Erro ao enviar formulario:', error);
    return res.status(500).json({ message: 'Erro interno ao processar o formulario.' });
  }
});

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.use((err, req, res, next) => {
  if (!err) return next();

  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ message: 'Cada imagem deve ter no maximo 10MB.' });
    }
    if (err.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({ message: 'Voce pode enviar no maximo 6 imagens.' });
    }
    return res.status(400).json({ message: `Erro de upload: ${err.message}` });
  }

  if (err.message === 'Apenas imagens JPG ou PNG sao permitidas.') {
    return res.status(400).json({ message: err.message });
  }

  console.error('Erro nao tratado:', err);
  return res.status(500).json({ message: 'Erro interno ao processar o formulario.' });
});

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
