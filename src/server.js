const express = require("express");
const multer = require("multer");
const PDFDocument = require("pdfkit");
const dotenv = require("dotenv");

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

const hasResendConfig =
  !!process.env.RESEND_API_KEY &&
  !!process.env.RESEND_FROM &&
  !!process.env.TARGET_EMAIL;

if (!hasResendConfig) {
  const resendKeys = ["RESEND_API_KEY", "RESEND_FROM", "TARGET_EMAIL"];
  const missingResendKeys = resendKeys.filter((key) => !process.env[key]);
  console.warn(
    `Resend incompleto. Envio de e-mail indisponivel. Variaveis ausentes: ${missingResendKeys.join(", ")}`,
  );
}

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static("public"));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    files: 6,
    fileSize: 10 * 1024 * 1024,
  },
  fileFilter: (req, file, cb) => {
    const supportedTypes = ["image/jpeg", "image/png"];
    if (file.mimetype && supportedTypes.includes(file.mimetype)) {
      return cb(null, true);
    }
    return cb(new Error("Apenas imagens JPG ou PNG sao permitidas."));
  },
});

function normalizeText(value) {
  return (value || "").toString().trim();
}

function normalizeOptionalEmail(email) {
  return email || "E-mail não informado.";
}

function formatSubmissionDate(date = new Date()) {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");

  return `${day}/${month}/${year} ${hours}:${minutes}`;
}

function generatePdfBuffer(formData, files) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 40 });
    const chunks = [];

    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fontSize(20).text("Formulario de Recadastro", { align: "center" });
    doc.moveDown();

    doc.fontSize(16).text("Dados do propietário");
    doc.fontSize(12);
    doc.text(`Nome: ${formData.nome}`);
    doc.text(`CPF: ${formData.cpf}`);
    doc.text(`Telefone: ${formData.telefone}`);
    doc.text(`Email: ${normalizeOptionalEmail(formData.email)}`);
    doc.moveDown();
    doc.fontSize(16).text("Dados do herdeiro");
    doc.fontSize(12);
    doc.text(`Herdeiro: ${formData.familiar}`);
    doc.text(`CPF Herdeiro: ${formData.cpfherdeiro}`);
    doc.moveDown();
    doc.text(`Data de envio: ${formatSubmissionDate()}`);

    if (files.length > 0) {
      doc.addPage();
      doc.fontSize(16).text("Imagens enviadas", { align: "center" });
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
            align: "center",
            valign: "center",
          });
        } catch (error) {
          doc.text("Nao foi possivel renderizar esta imagem no PDF.");
        }
      });
    }

    doc.end();
  });
}

function mapResendError(statusCode, errorMessage) {
  if (statusCode === 401 || statusCode === 403) {
    return "Falha de autenticacao Resend. Verifique RESEND_API_KEY.";
  }

  if (statusCode === 422) {
    return `Resend rejeitou os dados do e-mail: ${errorMessage || "verifique RESEND_FROM e TARGET_EMAIL."}`;
  }

  if (statusCode >= 500) {
    return "Falha temporaria na Resend. Tente novamente em instantes.";
  }

  return null;
}

async function sendEmailWithResend({
  nome,
  cpf,
  telefone,
  email,
  familiar,
  cpfherdeiro,
  pdfBuffer,
}) {
  const payload = {
    from: process.env.RESEND_FROM,
    to: [process.env.TARGET_EMAIL],
    subject: `Novo formulario - ${nome}`,
    text: [
      "Novo formulario recebido.",
      `Nome: ${nome}`,
      `CPF: ${cpf}`,
      `Telefone: ${telefone}`,
      `Email informado: ${normalizeOptionalEmail(email)}`,
      `Herdeiro: ${familiar}`,
      `CPF Herdeiro: ${cpfherdeiro}`,
    ].join("\n"),
    attachments: [
      {
        filename: `formulario-${Date.now()}.pdf`,
        content: pdfBuffer.toString("base64"),
      },
    ],
  };

  if (email) {
    payload.reply_to = email;
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  let responseBody = {};
  try {
    responseBody = await response.json();
  } catch (error) {
    responseBody = {};
  }

  if (!response.ok) {
    const resendMessage = mapResendError(
      response.status,
      responseBody?.message,
    );
    const error = new Error(
      resendMessage || "Erro ao enviar email pela Resend.",
    );
    error.statusCode = response.status;
    error.details = responseBody;
    throw error;
  }

  return responseBody;
}

app.post("/api/send-pdf", upload.array("images", 6), async (req, res) => {
  try {
    if (!hasResendConfig) {
      return res.status(500).json({
        message:
          "Resend nao configurado no servidor. Preencha RESEND_API_KEY, RESEND_FROM e TARGET_EMAIL.",
      });
    }

    const nome = normalizeText(req.body.nome);
    const cpf = normalizeText(req.body.cpf);
    const telefone = normalizeText(req.body.telefone);
    const email = normalizeText(req.body.email);
    const familiar = normalizeText(req.body.familiar);
    const cpfHerdeiro = normalizeText(req.body.cpfherdeiro);

    if (!nome || !cpf || !telefone || !familiar || !cpfHerdeiro) {
      return res
        .status(400)
        .json({ message: "Preencha todos os campos obrigatorios." });
    }

    const files = req.files || [];
    const pdfBuffer = await generatePdfBuffer(
      { nome, cpf, telefone, familiar, email, cpfherdeiro: cpfHerdeiro },
      files,
    );

    await sendEmailWithResend({
      nome,
      cpf,
      telefone,
      email,
      familiar,
      cpfherdeiro: cpfHerdeiro,
      pdfBuffer,
    });

    const imageCount = files.length;
    return res.json({
      message: `Formulario enviado com sucesso. ${imageCount} imagem(ns) anexada(s).`,
    });
  } catch (error) {
    if (error instanceof multer.MulterError) {
      return res
        .status(400)
        .json({ message: `Erro de upload: ${error.message}` });
    }

    if (
      error &&
      error.message === "Apenas imagens JPG ou PNG sao permitidas."
    ) {
      return res.status(400).json({ message: error.message });
    }

    if (error?.statusCode) {
      console.error("Erro Resend ao enviar formulario:", {
        statusCode: error.statusCode,
        details: error.details,
      });
      return res.status(500).json({ message: error.message });
    }

    console.error("Erro ao enviar formulario:", error);
    return res
      .status(500)
      .json({ message: "Erro interno ao processar o formulario." });
  }
});

app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok" });
});

app.use((err, req, res, next) => {
  if (!err) return next();

  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res
        .status(400)
        .json({ message: "Cada imagem deve ter no maximo 10MB." });
    }
    if (err.code === "LIMIT_FILE_COUNT") {
      return res
        .status(400)
        .json({ message: "Voce pode enviar no maximo 6 imagens." });
    }
    return res.status(400).json({ message: `Erro de upload: ${err.message}` });
  }

  if (err.message === "Apenas imagens JPG ou PNG sao permitidas.") {
    return res.status(400).json({ message: err.message });
  }

  console.error("Erro nao tratado:", err);
  return res
    .status(500)
    .json({ message: "Erro interno ao processar o formulario." });
});

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
