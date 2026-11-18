function isStudyImage(src) {
  return typeof src === 'string' && /^data:image\/(jpeg|png|webp|gif);base64,[a-zA-Z0-9+/=]+$/.test(src);
}

function validFigureRegion(region) {
  if (!region || !['x', 'y', 'w', 'h'].every(key => Number.isFinite(region[key]))) return false;
  const { x, y, w, h } = region;
  return x >= 0 && y >= 0 && w >= .01 && h >= .01 && x + w <= 1.000001 && y + h <= 1.000001;
}

async function studyImageCopy(src, mode = 'original', region = null) {
  const crop = validFigureRegion(region);
  if (mode === 'original' && !crop) return src;
  if (!isStudyImage(src)) throw Error('图片格式无效');
  const image = new Image();
  image.src = src;
  await image.decode();
  const { naturalWidth: width, naturalHeight: height } = image;
  const box = crop ? region : { x: 0, y: 0, w: 1, h: 1 };
  const scale = Math.min(1, 1800 / Math.max(width * box.w, height * box.h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * box.w * scale));
  canvas.height = Math.max(1, Math.round(height * box.h * scale));
  const ctx = canvas.getContext('2d', { willReadFrequently: mode !== 'original' });
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image, width * box.x, height * box.y, width * box.w, height * box.h, 0, 0, canvas.width, canvas.height);
  if (mode !== 'original') {
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
    whitenStudyPaper(pixels, mode === 'bw');
    ctx.putImageData(pixels, 0, 0);
  }
  return mode === 'bw' ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', .9);
}

function whitenStudyPaper({ width, height, data }, blackWhite) {
  // Estimate local paper brightness from bright regions, then interpolate to avoid tile edges.
  const step = Math.max(16, Math.round(Math.min(width, height) / 12));
  const cols = Math.ceil(width / step), rows = Math.ceil(height / step);
  const light = new Uint8Array(cols * rows);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const value = Math.round(.299 * data[i] + .587 * data[i + 1] + .114 * data[i + 2]);
      data[i] = value;
      const cell = Math.floor(y / step) * cols + Math.floor(x / step);
      light[cell] = Math.max(light[cell], value);
    }
  }
  const background = (x, y) => Math.max(70, light[y * cols + x]);
  for (let y = 0; y < height; y++) {
    const gy = Math.max(0, y / step - .5), top = Math.floor(gy), bottom = Math.min(rows - 1, top + 1);
    for (let x = 0; x < width; x++) {
      const gx = Math.max(0, x / step - .5), left = Math.floor(gx), right = Math.min(cols - 1, left + 1);
      const upper = background(left, top) + (background(right, top) - background(left, top)) * (gx - left);
      const lower = background(left, bottom) + (background(right, bottom) - background(left, bottom)) * (gx - left);
      const paper = upper + (lower - upper) * (gy - top);
      const i = (y * width + x) * 4;
      const density = (paper - data[i]) / paper;
      const value = blackWhite ? (density >= .20 ? 0 : 255) : 255 - Math.max(0, density - .035) * 435;
      data[i] = data[i + 1] = data[i + 2] = value;
    }
  }
}

function layoutFigureRegions(figures, width, height) {
  const pad = Math.max(3, Math.round(Math.min(width, height) * .015));
  return figures.flatMap(points => {
    if (!Array.isArray(points) || points.length !== 4 ||
        points.some(point => !point || !Number.isFinite(point.x) || !Number.isFinite(point.y))) return [];
    const xs = points.map(point => point.x), ys = points.map(point => point.y);
    if (Math.min(...xs) < 0 || Math.min(...ys) < 0 || Math.max(...xs) > width || Math.max(...ys) > height ||
        Math.max(...xs) <= Math.min(...xs) || Math.max(...ys) <= Math.min(...ys)) return [];
    const x = Math.max(0, Math.min(...xs) - pad) / width;
    const y = Math.max(0, Math.min(...ys) - pad) / height;
    const w = Math.min(width, Math.max(...xs) + pad) / width - x;
    const h = Math.min(height, Math.max(...ys) + pad) / height - y;
    return validFigureRegion({ x, y, w, h }) ? [{ x, y, w, h }] : [];
  }).sort((a, b) => a.y - b.y || a.x - b.x);
}

async function detectStudyFigures(image) {
  const scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  if (Math.min(canvas.width, canvas.height) < 64) throw Error('图片太窄，请手动框选');
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  const figures = await callBaiduOCR(canvas.toDataURL('image/jpeg', .9), 'figures');
  return layoutFigureRegions(figures, canvas.width, canvas.height);
}

async function openFigurePicker(src, previous, allowDetection = true) {
  if (!isStudyImage(src)) throw Error('没有可框选的原题图片');
  const dialog = document.createElement('dialog');
  dialog.className = 'figure-picker';
  dialog.innerHTML = `<div class="card-head"><h2>框选题目配图</h2></div>
    <p class="hint">在图上拖出方框，保留标注、坐标轴和图例。重新拖动可调整范围。</p>
    ${allowDetection ? `<div class="actions"><button type="button" class="secondary" data-detect>用百度自动找题图</button>
      <label hidden data-candidates>候选位置 <select aria-label="候选题图"></select></label></div>
      <p class="hint" data-detect-status role="status">每次点击调用一次百度「试卷分析与识别」。</p>` : ''}
    <div class="figure-stage"><img alt="待框选的原题图片" draggable="false"><span hidden></span></div>
    <div class="actions"><button type="button" class="secondary" data-cancel>取消</button>
    ${validFigureRegion(previous) ? '<button type="button" class="secondary" data-clear>移除题图</button>' : ''}
    <button type="button" class="primary" data-confirm disabled>保存题图</button></div>`;
  const stage = dialog.querySelector('.figure-stage');
  const image = stage.querySelector('img');
  const outline = stage.querySelector('span');
  const confirm = dialog.querySelector('[data-confirm]');
  const detect = dialog.querySelector('[data-detect]');
  const status = dialog.querySelector('[data-detect-status]');
  const candidates = dialog.querySelector('[data-candidates]');
  const choices = candidates?.querySelector('select');
  image.src = src;
  await image.decode();
  let region = previous, start, pointer, result, editCount = 0;
  function draw() {
    const valid = validFigureRegion(region);
    outline.hidden = !valid;
    confirm.disabled = !valid || pointer !== undefined;
    if (valid) Object.assign(outline.style, {
      left: region.x * 100 + '%', top: region.y * 100 + '%',
      width: region.w * 100 + '%', height: region.h * 100 + '%'
    });
  }
  function point(event) {
    const box = image.getBoundingClientRect();
    const clamp = value => Math.min(1, Math.max(0, value));
    return { x: clamp((event.clientX - box.left) / box.width), y: clamp((event.clientY - box.top) / box.height) };
  }
  stage.onpointerdown = event => {
    if (!event.isPrimary || event.button !== 0 || pointer !== undefined) return;
    stage.setPointerCapture(event.pointerId);
    pointer = event.pointerId;
    start = point(event);
    editCount++;
    if (choices) choices.value = '';
    confirm.disabled = true;
  };
  function move(event) {
    const end = point(event);
    region = { x: Math.min(start.x, end.x), y: Math.min(start.y, end.y), w: Math.abs(start.x - end.x), h: Math.abs(start.y - end.y) };
  }
  stage.onpointermove = event => { if (event.pointerId === pointer) { move(event); draw(); } };
  stage.onpointerup = event => { if (event.pointerId === pointer) { move(event); pointer = undefined; draw(); } };
  stage.onpointercancel = () => { pointer = undefined; region = previous; draw(); };
  if (detect) detect.onclick = async () => {
    const atStart = editCount;
    detect.disabled = true;
    status.textContent = '正在查找图和表格…';
    try {
      const figures = await detectStudyFigures(image);
      if (!dialog.open) return;
      candidates.hidden = !figures.length;
      if (!figures.length) {
        status.textContent = '没有找到题图，可以手动框选。';
        return;
      }
      choices.replaceChildren(new Option('选择候选位置', ''));
      figures.forEach((_, index) => choices.add(new Option('配图 ' + (index + 1), String(index))));
      choices.onchange = () => {
        if (choices.value === '' || pointer !== undefined) return;
        region = figures[Number(choices.value)];
        draw();
      };
      if (atStart === editCount && pointer === undefined) {
        choices.value = '0';
        choices.onchange();
      }
      status.textContent = `找到 ${figures.length} 处，请确认范围含完整标注，再保存题图。`;
    } catch (error) {
      if (dialog.open) status.textContent = `${error.message}。仍可手动框选。`;
    } finally {
      detect.disabled = false;
    }
  };
  dialog.querySelector('[data-cancel]').onclick = () => dialog.close();
  const clear = dialog.querySelector('[data-clear]');
  if (clear) clear.onclick = () => { result = null; dialog.close(); };
  confirm.onclick = () => { if (validFigureRegion(region)) { result = region; dialog.close(); } };
  document.body.append(dialog);
  draw();
  dialog.showModal();
  return new Promise(resolve => dialog.addEventListener('close', () => { dialog.remove(); resolve(result); }, { once: true }));
}

function showSavedFigure(container, src, region) {
  if (!container || !validFigureRegion(region)) return;
  studyImageCopy(src, 'original', region).then(copy => {
    if (!container.isConnected) return;
    const image = document.createElement('img');
    image.src = copy;
    image.alt = '题目配图';
    image.className = 'saved-figure';
    container.replaceChildren(image);
  }).catch(() => { container.textContent = '题图无法载入，请查看原图。'; });
}
