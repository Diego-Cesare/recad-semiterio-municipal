const statusEl = document.getElementById('status');
const formEl = document.getElementById('formulario');
const imagesInput = document.getElementById('images');
const previewEl = document.getElementById('preview');
const MAX_IMAGES = 6;
let selectedImages = [];

function setStatus(message, type = '') {
  statusEl.textContent = message;
  statusEl.className = `status ${type}`.trim();
}

function renderPreview(files) {
  previewEl.innerHTML = '';

  if (!files || files.length === 0) {
    return;
  }

  files.forEach((file) => {
    const wrapper = document.createElement('figure');
    wrapper.className = 'preview-item';

    const img = document.createElement('img');
    img.className = 'preview-image';
    img.src = URL.createObjectURL(file);
    img.alt = file.name;
    img.onload = () => URL.revokeObjectURL(img.src);

    const caption = document.createElement('figcaption');
    caption.className = 'preview-caption';
    caption.textContent = file.name;

    wrapper.appendChild(img);
    wrapper.appendChild(caption);
    previewEl.appendChild(wrapper);
  });
}

function fileKey(file) {
  return `${file.name}-${file.size}-${file.lastModified}`;
}

imagesInput.addEventListener('change', () => {
  const newFiles = Array.from(imagesInput.files);
  const alreadySelected = new Set(selectedImages.map(fileKey));

  const uniqueNewFiles = newFiles.filter((file) => !alreadySelected.has(fileKey(file)));
  const remainingSlots = MAX_IMAGES - selectedImages.length;

  if (remainingSlots <= 0) {
    setStatus('Voce ja selecionou o maximo de 6 imagens.', 'error');
    imagesInput.value = '';
    return;
  }

  const filesToAdd = uniqueNewFiles.slice(0, remainingSlots);
  selectedImages = selectedImages.concat(filesToAdd);
  renderPreview(selectedImages);

  if (filesToAdd.length < uniqueNewFiles.length) {
    setStatus('Limite de 6 imagens atingido. Algumas imagens nao foram adicionadas.', 'error');
  } else {
    setStatus(`${selectedImages.length} imagem(ns) selecionada(s).`, '');
  }

  imagesInput.value = '';
});

formEl.addEventListener('submit', async (event) => {
  event.preventDefault();
  setStatus('Enviando...');

  if (selectedImages.length > MAX_IMAGES) {
    setStatus('Selecione no maximo 6 imagens.', 'error');
    return;
  }

  const formData = new FormData();
  formData.append('nome', formEl.nome.value.trim());
  formData.append('cpf', formEl.cpf.value.trim());
  formData.append('telefone', formEl.telefone.value.trim());
  formData.append('familiar', formEl.familiar.value.trim());
  formData.append('email', formEl.email.value.trim());

  selectedImages.forEach((file) => {
    formData.append('images', file, file.name);
  });

  try {
    const response = await fetch('/api/send-pdf', {
      method: 'POST',
      body: formData,
    });

    const data = await response.json();

    if (!response.ok) {
      setStatus(data.message || 'Falha ao enviar formulario.', 'error');
      return;
    }

    setStatus(data.message || 'Formulario enviado com sucesso.', 'ok');
    formEl.reset();
    selectedImages = [];
    renderPreview([]);
  } catch (error) {
    setStatus('Erro de rede ao enviar formulario.', 'error');
  }
});
