const statusEl = document.getElementById("status");
const formEl = document.getElementById("formulario");
const imagesInput = document.getElementById("images");
const previewEl = document.getElementById("preview");
const MAX_IMAGES = 6;
let selectedImages = [];

function setStatus(message, type = "") {
  statusEl.textContent = message;
  statusEl.className = `status ${type}`.trim();
}

async function parseApiResponse(response) {
  const rawText = await response.text();
  if (!rawText) return {};

  try {
    return JSON.parse(rawText);
  } catch (error) {
    return { message: rawText };
  }
}

function renderPreview(files) {
  previewEl.innerHTML = "";

  if (!files || files.length === 0) {
    return;
  }

  files.forEach((file) => {
    const wrapper = document.createElement("figure");
    wrapper.className = "preview-item";

    const img = document.createElement("img");
    img.className = "preview-image";
    img.src = URL.createObjectURL(file);
    img.alt = file.name;
    img.onload = () => URL.revokeObjectURL(img.src);

    const caption = document.createElement("figcaption");
    caption.className = "preview-caption";
    caption.textContent = file.name;

    wrapper.appendChild(img);
    wrapper.appendChild(caption);
    previewEl.appendChild(wrapper);
  });
}

function fileKey(file) {
  return `${file.name}-${file.size}-${file.lastModified}`;
}

imagesInput.addEventListener("change", () => {
  const newFiles = Array.from(imagesInput.files);
  const alreadySelected = new Set(selectedImages.map(fileKey));

  const uniqueNewFiles = newFiles.filter(
    (file) => !alreadySelected.has(fileKey(file)),
  );
  const remainingSlots = MAX_IMAGES - selectedImages.length;

  if (remainingSlots <= 0) {
    setStatus("Voce ja selecionou o maximo de 6 imagens.", "error");
    imagesInput.value = "";
    return;
  }

  const filesToAdd = uniqueNewFiles.slice(0, remainingSlots);
  selectedImages = selectedImages.concat(filesToAdd);
  renderPreview(selectedImages);

  if (filesToAdd.length < uniqueNewFiles.length) {
    setStatus(
      "Limite de 6 imagens atingido. Algumas imagens nao foram adicionadas.",
      "error",
    );
  } else {
    setStatus(`${selectedImages.length} imagem(ns) selecionada(s).`, "");
  }

  imagesInput.value = "";
});

function validateCPF(cpf) {
  cpf = cpf.replace(/[^\d]+/g, "");

  if (cpf.length !== 11 || !!cpf.match(/(\d)\1{10}/)) return false;

  const digits = cpf.split("").map((el) => +el);

  const calculateDigit = (initialCount) => {
    let sum = 0;
    for (let i = 0; i < initialCount - 1; i++) {
      sum += digits[i] * (initialCount - i);
    }
    const rest = (sum * 10) % 11;
    return rest === 10 || rest === 11 ? 0 : rest;
  };

  const dg1 = calculateDigit(10);
  const dg2 = calculateDigit(11);

  return dg1 === digits[9] && dg2 === digits[10];
}

formEl.cpf.addEventListener("input", (e) => {
  let v = e.target.value.replace(/\D/g, "");

  if (v.length > 11) v = v.slice(0, 11);

  // Aplica a máscara progressivamente
  v = v.replace(/^(\d{3})(\d)/, "$1.$2");
  v = v.replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3");
  v = v.replace(/^(\d{3})\.(\d{3})\.(\d{3})(\d)/, "$1.$2.$3-$4");

  e.target.value = v;
});

formEl.cpfherdeiro.addEventListener("input", (e) => {
  let v = e.target.value.replace(/\D/g, "");

  if (v.length > 11) v = v.slice(0, 11);

  // Aplica a máscara progressivamente
  v = v.replace(/^(\d{3})(\d)/, "$1.$2");
  v = v.replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3");
  v = v.replace(/^(\d{3})\.(\d{3})\.(\d{3})(\d)/, "$1.$2.$3-$4");

  e.target.value = v;
});

formEl.telefone.addEventListener("input", (e) => {
  let v = e.target.value.replace(/\D/g, "").slice(0, 11);

  if (v.length > 10) {
    v = v.replace(/(\d{2})(\d{5})(\d{4})/, "($1)$2-$3");
  }
  e.target.value = v;
});

formEl.addEventListener("submit", async (event) => {
  event.preventDefault();
  setStatus("Enviando...");

  if (selectedImages.length > MAX_IMAGES) {
    setStatus("Selecione no maximo 6 imagens.", "error");
    return;
  }

  const formData = new FormData();
  formData.append("nome", formEl.nome.value.trim());
  formData.append("cpf", formEl.cpf.value.trim());
  formData.append("cpfherdeiro", formEl.cpfherdeiro.value.trim());
  const cpfValue = formEl.cpf.value.trim();
  const cpfHerdeiroValue = formEl.cpfherdeiro.value.trim();

  if (!validateCPF(cpfValue)) {
    setStatus("CPF inválido. Verifique os dados.", "error");
    return;
  }
  if (!validateCPF(cpfHerdeiroValue)) {
    setStatus("CPF do herdeiro inválido. Verifique os dados.", "error");
    return;
  }
  formData.append("telefone", formEl.telefone.value.trim());
  formData.append("familiar", formEl.familiar.value.trim());
  formData.append("email", formEl.email.value.trim());

  selectedImages.forEach((file) => {
    formData.append("images", file, file.name);
  });

  try {
    const response = await fetch("/api/send-pdf", {
      method: "POST",
      body: formData,
    });

    const data = await parseApiResponse(response);

    if (!response.ok) {
      setStatus(
        data.message || `Falha ao enviar formulario (HTTP ${response.status}).`,
        "error",
      );
      return;
    }

    setStatus(data.message || "Formulario enviado com sucesso.", "ok");
    formEl.reset();
    selectedImages = [];
    renderPreview([]);
  } catch (error) {
    setStatus(`Erro de rede ao enviar formulario: ${error.message}`, "error");
  }
});
